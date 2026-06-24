# Chat Feature — Server Deployment Instructions
_For the Claude instance running on the production server. Read this entire file before running anything._

---

## What was added

A full employee chatroom built on top of the existing ERPNext + React stack. No new dependencies were added to either the backend or frontend.

### New backend files
```
hr_client/hr_client/doctype/vera_chat_room/          ← new DocType
hr_client/hr_client/doctype/vera_chat_room_member/   ← child table DocType
hr_client/hr_client/doctype/vera_chat_message/       ← new DocType
hr_client/api/chat.py                                ← 12 API endpoints
```

### New/modified frontend files
```
hr-frontend/src/api/chat.ts               ← API call functions
hr-frontend/src/pages/chat/types.ts       ← TypeScript interfaces
hr-frontend/src/pages/chat/useChat.ts     ← React Query hooks + polling
hr-frontend/src/pages/chat/ChatPage.tsx   ← main two-panel layout
hr-frontend/src/pages/chat/RoomList.tsx   ← left panel (rooms + DM picker)
hr-frontend/src/pages/chat/MessageList.tsx
hr-frontend/src/pages/chat/MessageItem.tsx
hr-frontend/src/pages/chat/ChatInput.tsx  ← textarea + file attach + @mention
hr-frontend/src/pages/chat/MentionPicker.tsx
hr-frontend/src/pages/chat/FilePreview.tsx
hr-frontend/src/pages/chat/SearchPanel.tsx
hr-frontend/src/App.tsx                   ← added /chat route
hr-frontend/src/components/layout/Sidebar.tsx  ← added Chat nav item with badge
hr-frontend/vite.config.ts                ← added /files dev proxy
```

---

## Step 1 — Pull the branch

```bash
cd ~/frappe-bench/apps/hr_client
git pull origin thushaar

cd ~/hr-client-erp   # or wherever the frontend repo lives
git pull origin thushaar
```

---

## Step 2 — Migrate the new DocTypes

**This is required. Three new DocTypes must be created in the database.**

```bash
cd ~/frappe-bench
bench --site hrms.localhost migrate
bench --site hrms.localhost clear-cache
```

Expected output: should mention migrating `Vera Chat Room`, `Vera Chat Room Member`, `Vera Chat Message` among others. If it errors, see Troubleshooting below.

---

## Step 3 — Restart the backend

```bash
sudo supervisorctl restart frappe-web
# or if using bench start in dev:
# kill the bench process and restart with: bench start
```

---

## Step 4 — Build and deploy the frontend

```bash
cd ~/hr-client-erp/hr-frontend
npm run build
```

TypeScript must compile clean. If there are TS errors, see Troubleshooting below.

The `dist/` folder is served by nginx automatically — no nginx reload needed after a frontend rebuild.

---

## Step 5 — nginx: add /files/ proxy (REQUIRED for file attachments)

Without this, uploaded images and file attachments will 404.

Edit `/etc/nginx/sites-available/vera-erp` and add this block **inside the `server {}` block**, after the existing `/assets/` block:

```nginx
# Frappe uploaded files — required for chat attachments
location /files/ {
    proxy_pass http://127.0.0.1:8001;
    proxy_set_header Host hrms.localhost;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Then validate and reload:
```bash
sudo nginx -t          # must print "syntax is ok"
sudo systemctl reload nginx
```

---

## Step 6 — Smoke test

1. Open the app in browser and log in
2. Click **Chat** in the sidebar — should load the two-panel chat UI
3. The **General** room should appear automatically (created on first API call)
4. Send a message — it should appear immediately
5. Log in as a second user in another browser/incognito window — message should appear within 3 seconds (polling interval)
6. Test @mention: type `@` in the input — a dropdown of employees should appear
7. Test file attach: click the paperclip, upload an image — it should show inline after sending
8. Test DM: click `+` next to "Direct Messages", pick another user — a DM room opens
9. Test search: click the search button in the left panel, type a word from an existing message

---

## Troubleshooting

### `bench migrate` fails with "Table already exists" or similar

This means a partial migration ran before. Run:
```bash
bench --site hrms.localhost migrate --skip-failing
bench --site hrms.localhost clear-cache
```

If it still fails, check which DocType failed:
```bash
bench --site hrms.localhost console
>>> frappe.db.table_exists("Vera Chat Room")
>>> frappe.db.table_exists("Vera Chat Message")
```

If tables exist but are incomplete, drop and re-migrate:
```bash
>>> frappe.db.sql("DROP TABLE IF EXISTS `tabVera Chat Room Member`")
>>> frappe.db.sql("DROP TABLE IF EXISTS `tabVera Chat Message`")
>>> frappe.db.sql("DROP TABLE IF EXISTS `tabVera Chat Room`")
>>> frappe.db.commit()
# exit console, then:
bench --site hrms.localhost migrate
```

### TypeScript build fails

Common causes and fixes:

**"Cannot find module" errors** — dependencies missing:
```bash
cd ~/hr-client-erp/hr-frontend
npm install
npm run build
```

**Type errors in chat files** — the most likely ones:

1. `sendMsg` argument type mismatch — in `ChatPage.tsx`, `handleSend` adds `room_id` before calling `sendMsg`. If TS complains, add explicit cast:
   ```tsx
   sendMsg({ ...payload, room_id: activeRoomId } as any)
   ```

2. `useUnreadCounts` import in `Sidebar.tsx` — if TS can't resolve the path, check the import is:
   ```tsx
   import { useUnreadCounts } from "@/pages/chat/useChat"
   ```

3. `ReactNode` type errors in `MessageItem.tsx` renderContent — if TS complains about the return type of `renderContent`, add explicit return type:
   ```tsx
   function renderContent(...): React.ReactNode[] {
   ```

**Build passes but runtime errors occur** — see API errors below.

### API returns 403 on chat endpoints

The `chat.py` endpoints use `_require_login()` which throws if `frappe.session.user == "Guest"`. This means the user's session cookie isn't being sent.

Check: in the browser console, does the `/api/method/hr_client.api.chat.get_rooms` request include credentials? It should — the axios instance in `src/lib/api.ts` has `withCredentials: true`.

If the nginx config is missing CORS headers for the new `/files/` location, add:
```nginx
location /files/ {
    proxy_pass http://127.0.0.1:8001;
    proxy_set_header Host hrms.localhost;
    add_header Access-Control-Allow-Origin $http_origin always;
    add_header Access-Control-Allow-Credentials true always;
}
```

### File uploads fail (500 or 403)

Frappe's `upload_file` endpoint (`/api/method/upload_file`) needs the user to be logged in. This uses the same session cookie — should work automatically.

If you get a 403, check that the `Employee` role has permission to use file upload. In Frappe desk:
- Go to Role Permissions Manager
- Find the `File` DocType
- Ensure `Employee` role has Create/Read permissions

Alternatively run in bench console:
```python
frappe.db.sql("""
  INSERT IGNORE INTO `tabDocPerm` (name, parent, parenttype, parentfield, role, `read`, `write`, `create`)
  VALUES (
    'File-Employee-0', 'File', 'DocType', 'permissions', 'Employee', 1, 0, 1
  )
""")
frappe.db.commit()
bench --site hrms.localhost clear-cache
```

### General room not created / get_rooms returns empty

The General room is lazily created on the first call to `get_rooms`. If it's failing silently:

```bash
bench --site hrms.localhost console
>>> import frappe
>>> frappe.set_user("owais@veraenterprises.in")
>>> from hr_client.api.chat import get_rooms
>>> get_rooms()
```

This will show the actual Python exception if any. Common issue: the `Vera Chat Room Member` child table might not have migrated correctly. Re-run migrate.

### Messages not appearing for other users (polling not working)

The polling endpoint is `get_new_messages(room_id, since_id)`. It fires every 3 seconds. If messages appear for the sender but not the receiver:

1. Open browser DevTools → Network tab → filter by `get_new_messages`
2. Check that the request is going through and returning 200
3. Check the response body — it should have `{message: {success: true, messages: [...]}}`

If `messages` is always empty, the `since_id` might be wrong. Check `latestIdRef` in `useChat.ts` — it's set from the last message's `id` field, which maps to `name` in Frappe (e.g. `VCM-2026-0001`).

### @mention dropdown not appearing

The `get_users_for_mention` endpoint excludes the current user from the list. If the dropdown never shows, check:
1. The endpoint returns users: `curl https://yourdomain.com/api/method/hr_client.api.chat.get_users_for_mention`
2. In the frontend, `useMentionUsers()` is called in `ChatPage` and passed as `mentionUsers` to `ChatInput`
3. The trigger is typing `@` followed by a word character (`@\w*$` regex) — typing `@ ` with a space immediately won't trigger it

### Chat sidebar badge not updating

The `useUnreadCounts` hook in `Sidebar.tsx` polls every 10 seconds. The `last_read_message` is updated in `Vera Chat Room Member` when you call `mark_room_read`. If the badge never clears:

Check the DB:
```bash
bench --site hrms.localhost console
>>> frappe.get_all("Vera Chat Room Member", filters={"user": "your@email.com"}, fields=["parent", "last_read_message"])
```

The `last_read_message` should be set to the latest VCM-... ID after opening a room.

---

## Architecture notes (for future changes)

- **Transport**: polling only — no WebSocket. Active room polls every 3s via `get_new_messages`. Background unread polling every 10s. Presence ping every 30s. This is intentional — works through the existing nginx + Cloudflare tunnel with zero extra config.
- **General room**: lazily created on first `get_rooms()` call. All active System Users at that time are added. New employees added to the server after the room is created are added automatically on their first `get_rooms()` call.
- **DM rooms**: `get_or_create_dm(other_user)` is idempotent — safe to call multiple times.
- **File storage**: Frappe's built-in file system under `/files/`. Files are marked `is_private=0` so they can be served directly. The nginx `/files/` proxy block (Step 5) is what makes this accessible through the domain.
- **Mentions**: stored as a JSON array of email strings in `Vera Chat Message.mentions`. The frontend sends them as a JSON string in the POST body and the backend parses them with `json.loads`.
- **Soft delete**: `is_deleted=1` blanks content + file fields. The message record stays in DB. Frontend renders "Message deleted" placeholder.
- **Search**: plain SQL `LIKE %query%` on `content` field, scoped to rooms the current user is a member of. Fast enough for a 5-person team.
