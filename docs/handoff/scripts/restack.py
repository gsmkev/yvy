"""Lleva el arreglo de la primera rama a las siguientes del stack, espera CI y mergea en orden."""
import subprocess, json, sys, time
def sh(c, check=True):
    r=subprocess.run(c, shell=True, cwd='/home/user/yvy', capture_output=True, text=True)
    if check and r.returncode: raise SystemExit(f"FALLÓ: {c}\n{r.stdout}{r.stderr}")
    return r.stdout.strip()
def api(m, p, data=None):
    cmd=f"gh api -X {m} {p}"
    if data:
        json.dump(data, open('/tmp/claude-0/-home-user-yvy/18312ed2-b386-5e3b-a496-3e3287e84d36/scratchpad/r.json','w')); cmd+=" --input /tmp/claude-0/-home-user-yvy/18312ed2-b386-5e3b-a496-3e3287e84d36/scratchpad/r.json"
    o=sh(cmd); return json.loads(o) if o else {}
nums=[int(x) for x in sys.argv[1:]]
prs=[api('GET', f"repos/gsmkev/yvy/pulls/{n}") for n in nums]
tips={}
prev=None
for p in prs:
    br=p['head']['ref']; sh(f"git fetch -q origin {br}")
    if prev:
        sh(f"git checkout -q -B rs origin/{br}")
        sh(f"git -c user.name=Claude -c user.email=noreply@anthropic.com merge -q --no-edit {prev}")
        sh(f"git push -q origin HEAD:{br}")
    tips[p['number']]=sh("git rev-parse HEAD") if prev else sh(f"git rev-parse origin/{br}")
    prev=tips[p['number']]
for p in prs:
    n=p['number']; tip=tips[n]
    for _ in range(120):
        runs=[r for r in api('GET', f"repos/gsmkev/yvy/commits/{tip}/check-runs")['check_runs'] if not r['name'].startswith('Workers Builds')]
        if runs and all(r['status']=='completed' for r in runs): break
        time.sleep(20)
    bad=[r['name'] for r in runs if r['conclusion'] not in ('success','skipped','neutral')]
    if bad or not runs: raise SystemExit(f"CI falló en #{n}: {bad}")
    api('PATCH', f"repos/gsmkev/yvy/pulls/{n}", {'base':'main'}); time.sleep(3)
    api('PUT', f"repos/gsmkev/yvy/pulls/{n}/merge", {'merge_method':'merge'})
    print("mergeado", n, p['title'][:60], flush=True)
