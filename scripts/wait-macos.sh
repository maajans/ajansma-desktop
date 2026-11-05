#!/usr/bin/env bash
# macOS CI derlemesini bekler, dmg artefaktını indirir.
set -uo pipefail
cd /c/xampp/ajansma-desktop || exit 1
TOKEN=$(tr -d '\r\n ' < "$HOME/.ajansma-gh-token")
API="https://api.github.com/repos/maajans/ajansma-desktop"
H=(-H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json")

run_id_of_latest() {
  curl -s "${H[@]}" "$API/actions/runs?per_page=1" | python -c "import sys,json;print(json.load(sys.stdin)['workflow_runs'][0]['id'])"
}

for i in $(seq 1 120); do
  RID=$(run_id_of_latest)
  STATE=$(curl -s "${H[@]}" "$API/actions/runs/$RID" | python -c "
import sys,json;d=json.load(sys.stdin);print(d['status'],d['conclusion'] or '-')")
  echo "[$(date +%H:%M:%S)] run $RID → $STATE"
  case "$STATE" in
    completed\ *) break ;;
  esac
  sleep 45
done

RID=$(run_id_of_latest)
echo "--- işler:"
curl -s "${H[@]}" "$API/actions/runs/$RID/jobs" | python -c "
import sys,json
d=json.load(sys.stdin)
for j in d['jobs']:
    print(j['name'],'→',j['status'],j['conclusion'])
    if j['conclusion'] not in (None,'success'):
        for s in j.get('steps',[]):
            if s['conclusion'] not in (None,'success'): print('   adım:',s['number'],s['name'],s['conclusion'])
"
echo "--- artefaktlar:"
curl -s "${H[@]}" "$API/actions/runs/$RID/artifacts" | python -c "
import sys,json
d=json.load(sys.stdin)
for a in d.get('artifacts',[]): print(a['id'],a['name'],a['size_in_bytes'])
"
AID=$(curl -s "${H[@]}" "$API/actions/runs/$RID/artifacts" | python -c "
import sys,json
d=json.load(sys.stdin)
m=[a for a in d.get('artifacts',[]) if a['name']=='macos-dmg']
print(m[0]['id'] if m else '')
")
if [ -n "$AID" ]; then
  rm -rf ci-out && mkdir -p ci-out
  curl -sL "${H[@]}" "$API/actions/artifacts/$AID/zip" -o ci-out/macos-dmg.zip
  echo "zip: $(du -h ci-out/macos-dmg.zip | cut -f1)"
  cd ci-out && unzip -o -q macos-dmg.zip && cd ..
  ls -lh ci-out/*.dmg 2>/dev/null || ls -lh ci-out/
else
  echo "macos-dmg artefaktı yok"
fi
