"""Uso: stack_update.py <commit_base_exclusivo> <rama_base_previa>
Toma los commits base..claude/yvy-mvp en orden y los apila en PRs por ítem."""
import subprocess, json, re, sys, time
S='/tmp/claude-0/-home-user-yvy/18312ed2-b386-5e3b-a496-3e3287e84d36/scratchpad'
sys.path.insert(0,S)
from backlog_rows import rows
R=rows()
FOOT="\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n\nhttps://claude.ai/code/session_0121m53sSAVCQWNjm4XffNBA"
def sh(cmd, check=True):
    r=subprocess.run(cmd, shell=True, cwd='/home/user/yvy', capture_output=True, text=True)
    if check and r.returncode: raise SystemExit(f"FALLÓ: {cmd}\n{r.stdout}\n{r.stderr}")
    return r.stdout.strip()
def api(method, path, data=None):
    if data is not None: json.dump(data, open(S+'/a.json','w'))
    out=sh(f"gh api -X {method} {path}" + (f" --input {S}/a.json" if data is not None else ""))
    return json.loads(out) if out else {}
start, base = sys.argv[1], sys.argv[2]
prev_n = None
prs={}
page=1
while True:
    batch=api('GET', f"'repos/gsmkev/yvy/pulls?state=open&per_page=100&page={page}'")
    if not batch: break
    for p in batch: prs[p['head']['ref']]=p
    page+=1
used=set(json.load(open(S+'/stack_used.json'))) if __import__('os').path.exists(S+'/stack_used.json') else set()
for c in sh(f"git log --reverse --format=%H {start}..claude/yvy-mvp").split():
    subj=sh(f"git log -1 --format=%s {c}"); body=sh(f"git log -1 --format=%b {c}")
    body="\n".join(l for l in body.splitlines() if not l.startswith(("Co-Authored-By","Claude-Session"))).strip()
    m=re.match(r'^([A-Z]-\d+)(?: \([^)]*\))?:\s*(.*)',subj)
    if not m: print("sin ID, se saltea:",subj); continue
    iid=m.group(1); br=f"claude/backlog-{iid.lower()}"
    k=2
    while br in used: br=f"claude/backlog-{iid.lower()}-{k}"; k+=1
    used.add(br)
    sh(f"git push -q -f origin {c}:refs/heads/{br}")
    hecho=f"## Qué se hizo\n\n{body or subj}\n\n## Verificación\n\nLint, typecheck y tests del monorepo después de integrar; la rama apunta al commit integrado.\n\n## Orden\n\nApilado sobre `{base}`: mergear en orden."
    d=R.get(iid,{})
    if br in prs:
        p=prs[br]; n=p['number']
        old=p['body'] or ''
        old=re.sub(r"\n\nEste PR empieza con un commit vacío.*?(?=\n\n🤖)", "", old, flags=re.S)
        old=old.split("\n\n🤖")[0]
        api('PATCH', f"repos/gsmkev/yvy/pulls/{n}", {'base':base,'body':old+"\n\n"+hecho+FOOT,'title':subj[:250]})
        if p.get('draft'): sh(f"gh api -X POST repos/gsmkev/yvy/pulls/{n}/ccr/ready_for_review", check=False)
    else:
        pedido=f"**{d.get('que', subj)}**" if d else subj
        pr=api('POST', "repos/gsmkev/yvy/pulls", {'title':subj[:250],'head':br,'base':base,'body':f"## Qué pide el backlog\n\n{pedido}\n\n{hecho}{FOOT}"})
        n=pr['number']
    print(f"#{n} {br} <- {subj[:60]}", flush=True)
    base=br
    json.dump(sorted(used), open(S+'/stack_used.json','w'))
    time.sleep(2)
print("BASE_FINAL", base)
