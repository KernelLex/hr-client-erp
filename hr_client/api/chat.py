import frappe
import json
from frappe.utils import now_datetime
from hr_client.api.utils import handle_api_error

_ADMIN_USERS = {"Administrator", "owais@veraenterprises.in"}
_ONLINE_TTL = 300  # 5 minutes


def _current_user():
    return frappe.session.user


def _require_login():
    if frappe.session.user == "Guest":
        frappe.throw("Login required", frappe.PermissionError)


def _is_admin():
    return _current_user() in _ADMIN_USERS


def _is_room_member(room_id):
    return frappe.db.exists(
        "Vera Chat Room Member",
        {"parent": room_id, "user": _current_user()},
    )


def _get_all_active_users():
    """Return list of all non-Guest, non-Administrator system users."""
    users = frappe.get_all(
        "User",
        filters={"enabled": 1, "user_type": "System User"},
        fields=["name", "full_name", "user_image"],
    )
    return [u for u in users if u["name"] != "Guest"]


def _serialize_message(msg):
    mentions = []
    try:
        if msg.get("mentions"):
            mentions = json.loads(msg["mentions"])
    except Exception:
        pass
    return {
        "id": msg["name"],
        "room": msg["room"],
        "sender": msg["sender"],
        "sender_name": msg.get("sender_name") or msg["sender"],
        "content": msg["content"] if not msg.get("is_deleted") else None,
        "message_type": msg.get("message_type", "text"),
        "file_url": msg.get("file_url"),
        "file_name": msg.get("file_name"),
        "file_type": msg.get("file_type"),
        "file_size": msg.get("file_size"),
        "mentions": mentions,
        "sent_at": str(msg.get("sent_at") or ""),
        "edited_at": str(msg.get("edited_at") or "") if msg.get("edited_at") else None,
        "is_deleted": bool(msg.get("is_deleted")),
    }


def _ensure_general_room():
    """Lazily create the General room and add all active users if it doesn't exist."""
    existing = frappe.db.get_value("Vera Chat Room", {"room_type": "General"}, "name")
    if existing:
        return existing

    room = frappe.new_doc("Vera Chat Room")
    room.room_type = "General"
    room.display_name = "General"
    room.created_at = now_datetime()

    users = _get_all_active_users()
    for u in users:
        room.append("members", {
            "user": u["name"],
            "user_full_name": u["full_name"],
            "joined_at": now_datetime(),
        })

    room.insert(ignore_permissions=True)
    frappe.db.commit()
    return room.name


def _get_member_last_read(room_id, user):
    rows = frappe.get_all(
        "Vera Chat Room Member",
        filters={"parent": room_id, "user": user},
        fields=["last_read_message"],
        limit=1,
    )
    if rows:
        return rows[0].get("last_read_message") or ""
    return ""


def _count_unread(room_id, user):
    last_read = _get_member_last_read(room_id, user)
    if not last_read:
        return frappe.db.count("Vera Chat Message", {
            "room": room_id,
            "sender": ["!=", user],
            "is_deleted": 0,
        })

    # Count messages with name > last_read (lexicographic works for VCM-.YYYY.-.####)
    return frappe.db.sql(
        """SELECT COUNT(*) FROM `tabVera Chat Message`
           WHERE room = %s AND sender != %s AND is_deleted = 0
           AND name > %s""",
        (room_id, user, last_read),
    )[0][0]


def _count_mentions(room_id, user):
    """Count unread messages that mention the current user."""
    last_read = _get_member_last_read(room_id, user)
    where_extra = f"AND name > {frappe.db.escape(last_read)}" if last_read else ""
    rows = frappe.db.sql(
        f"""SELECT mentions FROM `tabVera Chat Message`
            WHERE room = %s AND is_deleted = 0 AND mentions IS NOT NULL AND mentions != ''
            {where_extra}""",
        (room_id,),
        as_dict=False,
    )
    count = 0
    for (raw,) in rows:
        try:
            if user in json.loads(raw):
                count += 1
        except Exception:
            pass
    return count


# ─── Room endpoints ───────────────────────────────────────────────────────────

@frappe.whitelist()
@handle_api_error
def get_rooms():
    _require_login()
    user = _current_user()

    general_id = _ensure_general_room()

    # Ensure current user is in the general room (handles late-joining employees)
    if not _is_room_member(general_id):
        room_doc = frappe.get_doc("Vera Chat Room", general_id)
        full_name = frappe.db.get_value("User", user, "full_name") or user
        room_doc.append("members", {
            "user": user,
            "user_full_name": full_name,
            "joined_at": now_datetime(),
        })
        room_doc.save(ignore_permissions=True)
        frappe.db.commit()

    # Rooms the user is a member of
    member_rows = frappe.get_all(
        "Vera Chat Room Member",
        filters={"user": user},
        fields=["parent"],
    )
    room_ids = [r["parent"] for r in member_rows]

    if not room_ids:
        return {"success": True, "rooms": []}

    rooms = frappe.get_all(
        "Vera Chat Room",
        filters={"name": ["in", room_ids]},
        fields=["name", "room_type", "display_name", "created_at"],
    )

    result = []
    for room in rooms:
        rid = room["name"]

        # Last message preview
        last_msgs = frappe.get_all(
            "Vera Chat Message",
            filters={"room": rid, "is_deleted": 0},
            fields=["content", "sender_name", "sent_at", "message_type", "file_name"],
            order_by="sent_at desc",
            limit=1,
        )
        last_msg = None
        if last_msgs:
            lm = last_msgs[0]
            preview = lm["content"]
            if lm["message_type"] == "file":
                preview = f"📎 {lm.get('file_name') or 'File'}"
            last_msg = {
                "preview": preview,
                "sender_name": lm.get("sender_name"),
                "sent_at": str(lm.get("sent_at") or ""),
            }

        unread = _count_unread(rid, user)
        mention_count = _count_mentions(rid, user)

        # For DMs, display the OTHER person's name (stored display_name is set from
        # the initiator's perspective, so the recipient would see their own name).
        if room["room_type"] == "Direct":
            other = frappe.get_all(
                "Vera Chat Room Member",
                filters={"parent": rid, "user": ["!=", user]},
                fields=["user_full_name"],
                limit=1,
            )
            display_name = other[0]["user_full_name"] if other else room["display_name"]
        else:
            display_name = room["display_name"]

        # For Group rooms, include member count
        member_count = None
        if room["room_type"] == "Group":
            member_count = frappe.db.count("Vera Chat Room Member", {"parent": rid})

        result.append({
            "id": rid,
            "room_type": room["room_type"],
            "display_name": display_name,
            "created_at": str(room.get("created_at") or ""),
            "unread": unread,
            "mention_count": mention_count,
            "last_message": last_msg,
            "member_count": member_count,
        })

    # Sort: General first, then DMs by last message
    result.sort(key=lambda r: (0 if r["room_type"] == "General" else 1, r["id"]))
    return {"success": True, "rooms": result}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def get_or_create_dm(other_user):
    _require_login()
    user = _current_user()

    if other_user == user:
        frappe.throw("Cannot DM yourself", frappe.ValidationError)

    # Verify other_user exists
    if not frappe.db.exists("User", other_user):
        frappe.throw(f"User {other_user} not found", frappe.DoesNotExistError)

    # Find an existing DM room between the two users
    user_rooms = frappe.get_all(
        "Vera Chat Room Member", filters={"user": user}, pluck="parent"
    )
    other_rooms = frappe.get_all(
        "Vera Chat Room Member", filters={"user": other_user}, pluck="parent"
    )
    common = set(user_rooms) & set(other_rooms)

    for rid in common:
        rtype = frappe.db.get_value("Vera Chat Room", rid, "room_type")
        if rtype == "Direct":
            return {"success": True, "room_id": rid, "created": False}

    # Create new DM room
    other_full = frappe.db.get_value("User", other_user, "full_name") or other_user
    my_full = frappe.db.get_value("User", user, "full_name") or user

    room = frappe.new_doc("Vera Chat Room")
    room.room_type = "Direct"
    room.display_name = other_full  # shown to the initiating user
    room.created_at = now_datetime()
    room.append("members", {"user": user, "user_full_name": my_full, "joined_at": now_datetime()})
    room.append("members", {"user": other_user, "user_full_name": other_full, "joined_at": now_datetime()})
    room.insert(ignore_permissions=True)
    frappe.db.commit()

    return {"success": True, "room_id": room.name, "created": True}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def mark_room_read(room_id):
    _require_login()
    user = _current_user()

    if not _is_room_member(room_id):
        frappe.throw("Not a member of this room", frappe.PermissionError)

    # Get latest message id
    latest = frappe.get_all(
        "Vera Chat Message",
        filters={"room": room_id},
        fields=["name"],
        order_by="sent_at desc",
        limit=1,
    )
    if not latest:
        return {"success": True}

    latest_id = latest[0]["name"]

    frappe.db.sql(
        """UPDATE `tabVera Chat Room Member`
           SET last_read_message = %s
           WHERE parent = %s AND user = %s""",
        (latest_id, room_id, user),
    )
    frappe.db.commit()
    return {"success": True}


# ─── Message endpoints ────────────────────────────────────────────────────────

_MSG_FIELDS = [
    "name", "room", "sender", "sender_name", "content",
    "message_type", "file_url", "file_name", "file_type", "file_size",
    "mentions", "sent_at", "edited_at", "is_deleted",
]


@frappe.whitelist()
@handle_api_error
def get_messages(room_id, limit=50, before_id=None):
    _require_login()
    user = _current_user()

    if not _is_room_member(room_id):
        frappe.throw("Not a member of this room", frappe.PermissionError)

    limit = min(int(limit), 100)
    filters = {"room": room_id}

    if before_id:
        filters["name"] = ["<", before_id]

    msgs = frappe.get_all(
        "Vera Chat Message",
        filters=filters,
        fields=_MSG_FIELDS,
        order_by="sent_at desc",
        limit=limit + 1,
    )

    has_more = len(msgs) > limit
    msgs = msgs[:limit]
    msgs.reverse()  # oldest first for display

    return {
        "success": True,
        "messages": [_serialize_message(m) for m in msgs],
        "has_more": has_more,
    }


@frappe.whitelist()
@handle_api_error
def get_new_messages(room_id, since_id):
    _require_login()

    if not _is_room_member(room_id):
        frappe.throw("Not a member of this room", frappe.PermissionError)

    msgs = frappe.get_all(
        "Vera Chat Message",
        filters={"room": room_id, "name": [">", since_id]},
        fields=_MSG_FIELDS,
        order_by="sent_at asc",
        limit=100,
    )

    return {
        "success": True,
        "messages": [_serialize_message(m) for m in msgs],
    }


@frappe.whitelist(methods=["POST"])
@handle_api_error
def send_message(room_id, content=None, file_url=None, file_name=None,
                 file_type=None, file_size=None, mentions=None):
    _require_login()
    user = _current_user()

    if not _is_room_member(room_id):
        frappe.throw("Not a member of this room", frappe.PermissionError)

    has_file = bool(file_url)
    has_content = bool(content and str(content).strip())

    if not has_content and not has_file:
        frappe.throw("Message cannot be empty", frappe.ValidationError)

    if has_content and len(str(content)) > 2000:
        frappe.throw("Message too long (max 2000 characters)", frappe.ValidationError)

    msg_type = "file" if has_file else "text"

    # Parse + validate mentions JSON
    mentions_json = "[]"
    if mentions:
        try:
            parsed = json.loads(mentions) if isinstance(mentions, str) else mentions
            if isinstance(parsed, list):
                mentions_json = json.dumps(parsed)
        except Exception:
            pass

    doc = frappe.new_doc("Vera Chat Message")
    doc.room = room_id
    doc.sender = user
    doc.sender_name = frappe.db.get_value("User", user, "full_name") or user
    doc.content = str(content).strip() if has_content else None
    doc.message_type = msg_type
    doc.file_url = file_url
    doc.file_name = file_name
    doc.file_type = file_type
    doc.file_size = int(file_size) if file_size else None
    doc.mentions = mentions_json
    doc.sent_at = now_datetime()
    doc.is_deleted = 0
    doc.insert(ignore_permissions=True)
    frappe.db.commit()

    return {"success": True, "message": _serialize_message(doc.as_dict())}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def delete_message(message_id):
    _require_login()
    user = _current_user()

    try:
        doc = frappe.get_doc("Vera Chat Message", message_id)
    except frappe.DoesNotExistError:
        frappe.throw("Message not found", frappe.DoesNotExistError)

    if doc.sender != user and not _is_admin():
        frappe.throw("Cannot delete another user's message", frappe.PermissionError)

    doc.is_deleted = 1
    doc.content = None
    doc.file_url = None
    doc.file_name = None
    doc.file_type = None
    doc.file_size = None
    doc.mentions = "[]"
    doc.save(ignore_permissions=True)
    frappe.db.commit()

    return {"success": True}


@frappe.whitelist()
@handle_api_error
def search_messages(query, room_id=None, limit=20):
    _require_login()
    user = _current_user()

    if not query or len(str(query).strip()) < 2:
        frappe.throw("Query must be at least 2 characters", frappe.ValidationError)

    limit = min(int(limit), 50)

    # Rooms user is a member of
    member_rows = frappe.get_all(
        "Vera Chat Room Member", filters={"user": user}, pluck="parent"
    )
    if not member_rows:
        return {"success": True, "results": []}

    room_filter = member_rows
    if room_id and room_id in member_rows:
        room_filter = [room_id]

    safe_query = frappe.db.escape(f"%{query.strip()}%")
    room_placeholders = ", ".join(["%s"] * len(room_filter))

    rows = frappe.db.sql(
        f"""SELECT name, room, sender, sender_name, content, message_type,
                   file_name, sent_at, is_deleted
            FROM `tabVera Chat Message`
            WHERE room IN ({room_placeholders})
              AND is_deleted = 0
              AND content LIKE {safe_query}
            ORDER BY sent_at DESC
            LIMIT %s""",
        tuple(room_filter) + (limit,),
        as_dict=True,
    )

    # Attach room display_name for context
    room_names = {
        r["name"]: r["display_name"]
        for r in frappe.get_all(
            "Vera Chat Room",
            filters={"name": ["in", list({r["room"] for r in rows})]},
            fields=["name", "display_name"],
        )
    } if rows else {}

    results = []
    for r in rows:
        results.append({
            "id": r["name"],
            "room": r["room"],
            "room_name": room_names.get(r["room"], r["room"]),
            "sender": r["sender"],
            "sender_name": r.get("sender_name") or r["sender"],
            "content": r["content"],
            "message_type": r.get("message_type", "text"),
            "file_name": r.get("file_name"),
            "sent_at": str(r.get("sent_at") or ""),
        })

    return {"success": True, "results": results}


# ─── Presence endpoints ───────────────────────────────────────────────────────

@frappe.whitelist(methods=["POST"])
@handle_api_error
def ping_online():
    _require_login()
    user = _current_user()
    frappe.cache().set(f"chat_online_{user}", "1", expires_in_sec=_ONLINE_TTL)
    return {"success": True}


@frappe.whitelist()
@handle_api_error
def get_online_users():
    _require_login()
    users = _get_all_active_users()
    online = []
    for u in users:
        if frappe.cache().get(f"chat_online_{u['name']}"):
            online.append({
                "user": u["name"],
                "full_name": u["full_name"],
                "user_image": u.get("user_image"),
            })
    return {"success": True, "online_users": online}


# ─── Unread counts ────────────────────────────────────────────────────────────

@frappe.whitelist()
@handle_api_error
def get_unread_counts():
    _require_login()
    user = _current_user()

    member_rows = frappe.get_all(
        "Vera Chat Room Member", filters={"user": user}, pluck="parent"
    )

    counts = {}
    total_mentions = 0
    for rid in member_rows:
        unread = _count_unread(rid, user)
        mentions = _count_mentions(rid, user)
        counts[rid] = {"unread": unread, "mention_count": mentions}
        total_mentions += mentions

    total_unread = sum(v["unread"] for v in counts.values())
    return {
        "success": True,
        "counts": counts,
        "total_unread": total_unread,
        "total_mentions": total_mentions,
    }


# ─── Helpers for frontend user list ──────────────────────────────────────────

@frappe.whitelist()
@handle_api_error
def get_users_for_mention():
    """Return all employees for @mention autocomplete."""
    _require_login()
    users = _get_all_active_users()
    return {
        "success": True,
        "users": [
            {"user": u["name"], "full_name": u["full_name"], "user_image": u.get("user_image")}
            for u in users
            if u["name"] != _current_user()
        ],
    }


@frappe.whitelist(methods=["POST"])
@handle_api_error
def create_group(display_name, members_json=None):
    """Create a new Group room. Any logged-in user can create groups."""
    _require_login()
    user = _current_user()

    if not display_name or not str(display_name).strip():
        frappe.throw("Group name is required", frappe.ValidationError)

    display_name = str(display_name).strip()
    if len(display_name) > 60:
        frappe.throw("Group name too long (max 60 characters)", frappe.ValidationError)

    # Parse member list
    members = []
    if members_json:
        try:
            parsed = json.loads(members_json) if isinstance(members_json, str) else members_json
            if isinstance(parsed, list):
                members = [m for m in parsed if frappe.db.exists("User", m)]
        except Exception:
            pass

    # Always include creator
    if user not in members:
        members.append(user)

    room = frappe.new_doc("Vera Chat Room")
    room.room_type = "Group"
    room.display_name = display_name
    room.created_at = now_datetime()

    for member_user in members:
        full_name = frappe.db.get_value("User", member_user, "full_name") or member_user
        room.append("members", {
            "user": member_user,
            "user_full_name": full_name,
            "joined_at": now_datetime(),
        })

    room.insert(ignore_permissions=True)
    frappe.db.commit()

    return {"success": True, "room_id": room.name, "created": True}
