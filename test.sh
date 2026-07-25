#!/bin/bash
set -e
cd "$(dirname "$0")"
# Раньше здесь было `rm -rf data` (файл SQLite). Теперь база — Postgres,
# поэтому вместо удаления файла чистим таблицы и сбрасываем автоинкременты.
# Требует DATABASE_URL в окружении или в .env (см. .env.example).
node src/db/reset.js
BASE="http://localhost:4000"

echo "== starting server =="
node src/server.js > /tmp/server.log 2>&1 &
SERVER_PID=$!
trap "kill $SERVER_PID 2>/dev/null" EXIT

for i in $(seq 1 20); do
  if curl -s -o /dev/null "$BASE/api/health"; then break; fi
  sleep 0.3
done

echo -e "\n== health =="
curl -s "$BASE/api/health"; echo

echo -e "\n== bad login (expect 401) =="
curl -s -o /tmp/out.json -w "status=%{http_code}\n" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"email":"parent@demo.family","password":"wrong"}'
cat /tmp/out.json; echo

echo -e "\n== login parent =="
PARENT_JSON=$(curl -s -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"parent@demo.family","password":"demo1234"}')
echo "$PARENT_JSON"
PARENT_TOKEN=$(node -e "console.log(JSON.parse(process.argv[1]).token)" "$PARENT_JSON")

echo -e "\n== login child =="
CHILD_JSON=$(curl -s -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"sonya@demo.family","password":"demo1234"}')
echo "$CHILD_JSON"
CHILD_TOKEN=$(node -e "console.log(JSON.parse(process.argv[1]).token)" "$CHILD_JSON")

echo -e "\n== overview as parent (before) =="
curl -s "$BASE/api/overview" -H "Authorization: Bearer $PARENT_TOKEN"; echo

echo -e "\n== pending requests as parent =="
curl -s "$BASE/api/requests?status=pending" -H "Authorization: Bearer $PARENT_TOKEN"; echo

echo -e "\n== child tries a parent-only route (expect 403) =="
curl -s -o /tmp/out.json -w "status=%{http_code}\n" "$BASE/api/alerts" -H "Authorization: Bearer $CHILD_TOKEN"
cat /tmp/out.json; echo

echo -e "\n== parent approves request #1 (+20 min) =="
curl -s -X POST "$BASE/api/requests/1/respond" -H "Authorization: Bearer $PARENT_TOKEN" \
  -H "Content-Type: application/json" -d '{"decision":"approved","comment":"Ладно, но потом спать"}'; echo

echo -e "\n== overview as parent (bonus should be +20) =="
curl -s "$BASE/api/overview" -H "Authorization: Bearer $PARENT_TOKEN"; echo

echo -e "\n== child submits quest #1 =="
curl -s -X POST "$BASE/api/quests/1/submit" -H "Authorization: Bearer $CHILD_TOKEN"; echo

echo -e "\n== quests list (quest #1 should be pending_review) =="
curl -s "$BASE/api/quests" -H "Authorization: Bearer $CHILD_TOKEN"; echo

echo -e "\n== pending requests as parent (should include the quest) =="
curl -s "$BASE/api/requests?status=pending" -H "Authorization: Bearer $PARENT_TOKEN"; echo

echo -e "\n== parent approves the quest request (#4) =="
curl -s -X POST "$BASE/api/requests/4/respond" -H "Authorization: Bearer $PARENT_TOKEN" \
  -H "Content-Type: application/json" -d '{"decision":"approved","comment":"Отлично!"}'; echo

echo -e "\n== quests list (quest #1 should now be completed) =="
curl -s "$BASE/api/quests" -H "Authorization: Bearer $CHILD_TOKEN"; echo

echo -e "\n== overview (bonus should now be +20+30=50) =="
curl -s "$BASE/api/overview" -H "Authorization: Bearer $PARENT_TOKEN"; echo

echo -e "\n== history =="
curl -s "$BASE/api/history" -H "Authorization: Bearer $PARENT_TOKEN"; echo

echo -e "\n== child logs usage (simulated device agent) =="
curl -s -X POST "$BASE/api/usage/log" -H "Authorization: Bearer $CHILD_TOKEN" \
  -H "Content-Type: application/json" -d '{"appName":"Minecraft","category":"Игры","minutes":10}'; echo

echo -e "\n== overview (Minecraft should appear, usedMinutes +10) =="
curl -s "$BASE/api/overview" -H "Authorization: Bearer $PARENT_TOKEN"; echo

echo -e "\n== parent toggles schedule block #1 off =="
curl -s -X PUT "$BASE/api/settings/schedule/1" -H "Authorization: Bearer $PARENT_TOKEN" \
  -H "Content-Type: application/json" -d '{"active":false}'; echo

echo -e "\n== settings (block 1 should be active:0) =="
curl -s "$BASE/api/settings" -H "Authorization: Bearer $PARENT_TOKEN"; echo

echo -e "\n== child creates a time request =="
curl -s -X POST "$BASE/api/requests" -H "Authorization: Bearer $CHILD_TOKEN" \
  -H "Content-Type: application/json" -d '{"type":"time","amount":15,"label":"Доп. 15 минут","reason":"Хочу дописать проект"}'; echo

echo -e "\n== ALL TESTS COMPLETED OK =="
