import subprocess, json, time, sys
def gh(args, inp=None):
    r=subprocess.run("gh api "+args, shell=True, capture_output=True, text=True, input=inp)
    if r.returncode: raise RuntimeError(args+"\n"+r.stdout+r.stderr)
    return json.loads(r.stdout) if r.stdout.strip() else {}
prs={}
page=1
while True:
    b=gh(f"'repos/gsmkev/yvy/pulls?state=open&per_page=100&page={page}'")
    if not b: break
    for p in b: prs[p['number']]=p
    page+=1
by_base={}
for p in prs.values(): by_base.setdefault(p['base']['ref'],[]).append(p)
prev=sys.argv[1]  # rama del último PR mergeado
limit=int(sys.argv[2]) if len(sys.argv)>2 else 999
done=0
while done<limit:
    nxt=[p for p in by_base.get(prev,[])]
    if not nxt: print("fin de la pila tras", prev); break
    p=nxt[0]; n=p['number']; sha=p['head']['sha']
    runs=gh(f"repos/gsmkev/yvy/commits/{sha}/check-runs")['check_runs']
    states={r['name']:(r['status'],r['conclusion']) for r in runs}
    bad=[k for k,(s,c) in states.items() if s=='completed' and c not in ('success','skipped','neutral')]
    pending=[k for k,(s,c) in states.items() if s!='completed']
    if bad or pending or not states:
        print(f"PARA en #{n} {p['title'][:60]}: CI {states}"); break
    gh(f"-X PATCH repos/gsmkev/yvy/pulls/{n} -f base=main")
    for i in range(10):
        st=gh(f"repos/gsmkev/yvy/pulls/{n}")
        if st.get('mergeable') is not None: break
        time.sleep(2)
    if st.get('mergeable') is False: print(f"PARA en #{n}: no se puede mergear (conflicto)"); break
    gh(f"-X PUT repos/gsmkev/yvy/pulls/{n}/merge -f merge_method=merge")
    print(f"mergeado #{n} {p['title'][:70]}", flush=True)
    prev=p['head']['ref']; done+=1
    time.sleep(1)
