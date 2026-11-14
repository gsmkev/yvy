"""Uso: integrate.py <commit>...  — apila cada commit en el PR de su ítem, espera CI y mergea en orden."""
import subprocess, json, re, sys, time
S='/tmp/claude-0/-home-user-yvy/18312ed2-b386-5e3b-a496-3e3287e84d36/scratchpad'
FOOT="\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n\nhttps://claude.ai/code/session_0121m53sSAVCQWNjm4XffNBA"
def sh(cmd, check=True):
    r=subprocess.run(cmd, shell=True, cwd='/home/user/yvy', capture_output=True, text=True)
    if check and r.returncode: raise SystemExit(f"FALLÓ: {cmd}\n{r.stdout}\n{r.stderr}")
    return r.stdout.strip()
def api(method, path, data=None):
    if data is not None: json.dump(data, open(S+'/i.json','w'))
    out=sh(f"gh api -X {method} {path}" + (f" --input {S}/i.json" if data is not None else ""))
    return json.loads(out) if out else {}
prs={}; page=1
while True:
    b=api('GET', f"'repos/gsmkev/yvy/pulls?state=all&per_page=100&page={page}'")
    if not b: break
    for p in b: prs.setdefault(p['head']['ref'], p)
    page+=1
sh("git fetch -q origin main")
prev_branch='main'; prev_tip=sh("git rev-parse origin/main")
stack=[]
taken=set()
sys.path.insert(0,S)
from backlog_rows import rows
R=rows()
for c in sys.argv[1:]:
    subj=sh(f"git log -1 --format=%s {c}")
    body=sh(f"git log -1 --format=%b {c}")
    body="\n".join(l for l in body.splitlines() if not l.startswith(("Co-Authored-By","Claude-Session"))).strip()
    iid=re.match(r'^([A-Z]-\d+)',subj).group(1)
    br=f"claude/backlog-{iid.lower()}"; k=2
    while br in taken or (br in prs and (prs[br]['state']!='open' or not prs[br]['draft'])): br=f"claude/backlog-{iid.lower()}-{k}"; k+=1
    taken.add(br)
    exists = br in prs
    if exists:
        sh(f"git fetch -q origin {br}")
        sh(f"git checkout -q -B work origin/{br}")
        sh(f"git -c user.name=Claude -c user.email=noreply@anthropic.com merge -q --no-edit {prev_tip}")
    else:
        sh(f"git checkout -q -B work {prev_tip}")
    r=subprocess.run(f"git -c user.name=Claude -c user.email=noreply@anthropic.com cherry-pick {c}", shell=True, cwd='/home/user/yvy', capture_output=True, text=True)
    if r.returncode: sh("git cherry-pick --abort", check=False); raise SystemExit(f"conflicto en {subj}\n{r.stdout}{r.stderr}")
    tip=sh("git rev-parse HEAD")
    sh(f"git push -q origin {tip}:refs/heads/{br}")
    hecho=f"## Qué se hizo\n\n{body or subj}\n\n## Verificación\n\nLint, typecheck y tests del monorepo en la rama integrada; CI del PR en verde antes de mergear."
    if exists:
        p=prs[br]; n=p['number']
        old=(p['body'] or '').split("\n\n🤖")[0]
        old=re.sub(r"\n\nEste PR empieza con un commit vacío.*$", "", old, flags=re.S)
        api('PATCH', f"repos/gsmkev/yvy/pulls/{n}", {'base':prev_branch,'title':subj[:250],'body':old+"\n\n"+hecho+FOOT})
        sh(f"gh api -X POST repos/gsmkev/yvy/pulls/{n}/ccr/ready_for_review", check=False)
    else:
        d=R.get(iid)
        pedido=(f"## Qué pide el backlog\n\n**{d['que']}**\n\n" if d else "")
        n=api('POST',"repos/gsmkev/yvy/pulls",{'title':subj[:250],'head':br,'base':prev_branch,'body':pedido+hecho+FOOT})['number']
    stack.append((n,br,tip,subj)); print(f"PR #{n} {subj[:70]}", flush=True)
    prev_branch=br; prev_tip=tip
sh("git checkout -q claude/yvy-mvp")
# Esperar CI y mergear en orden
for n,br,tip,subj in stack:
    for _ in range(90):
        runs=api('GET', f"repos/gsmkev/yvy/commits/{tip}/check-runs")['check_runs']
        own=[r for r in runs if not r['name'].startswith('Workers Builds')]
        if own and all(r['status']=='completed' for r in own): break
        time.sleep(20)
    runs=[r for r in runs if not r['name'].startswith('Workers Builds')]
    bad=[r['name'] for r in runs if r['conclusion'] not in ('success','skipped','neutral')]
    if bad or not runs: raise SystemExit(f"CI falló en #{n} {subj}: {bad}")
    api('PATCH', f"repos/gsmkev/yvy/pulls/{n}", {'base':'main'})
    time.sleep(3)
    api('PUT', f"repos/gsmkev/yvy/pulls/{n}/merge", {'merge_method':'merge'})
    print(f"mergeado #{n} {subj[:70]}", flush=True)
sh("git fetch -q origin main")
print("main en", sh("git rev-parse --short origin/main"))
