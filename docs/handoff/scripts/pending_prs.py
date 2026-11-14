import subprocess, json, sys, time
S='/tmp/claude-0/-home-user-yvy/18312ed2-b386-5e3b-a496-3e3287e84d36/scratchpad'
sys.path.insert(0,S)
from backlog_rows import rows
R=rows()
DONE=set("S-02 S-01 M-01 F-20 F-21 F-22 U-02 F-02 M-13 U-01 U-03 U-10 U-11 U-12 K-01 S-05 U-04 S-06 U-13 U-16 U-14 V-01 V-02 V-03 V-09 P-09".split())
blocked={'P-01':'credenciales de Cloudflare y Resend','P-30':'cuenta de Play Store','P-20':'celular Android físico','P-32':'cuenta de Apple','P-11':'pasarela de pago','I-07':'contrato con pasarela de pago','E-39':'proveedor de factura electrónica homologado','M-14':'ADR de fuente nueva (Copernicus DEM)','M-15':'ADR de fuente nueva (OpenStreetMap)','S-12':'ADR de fuente nueva (Sentinel-1)','E-40':'fuente de precios con licencia','K-13':'WhatsApp Business (pago)','K-12':'WhatsApp Business (pago)','C-11':'hardware de estación','C-12':'sensores LoRa','F-27':'lector RFID','I-05':'balanzas y lectores','I-03':'convenio con fabricantes de maquinaria','G-23':'acceso al sistema oficial de trazabilidad','V-07':'datos de pilotos reales','V-08':'grabación de video','U-22':'traducción al guaraní por hablante nativo','X-40':'modelo en la nube con costo','X-41':'modelo en la nube con costo','X-42':'modelo en la nube con costo','X-43':'modelo en la nube con costo'}
for k in 'X-01 X-02 X-03 X-04 X-05 X-06 X-07 X-08 X-20 X-21 X-22 X-23 X-24 X-25'.split(): blocked[k]='datos etiquetados para entrenar el modelo'
CRIT={
 'Web':["Funciona en escritorio y en el celular (360 px) sin scroll horizontal","Sigue el estilo de la web: Fraunces en títulos, Inter, botones de texto sin ícono, sin píldoras ni mayúsculas forzadas"],
 'App':["Funciona sin señal y la escritura local va en una transacción con su mutación en el outbox","Sigue el kit de la app (src/ui/kit.tsx) y sus tokens; toques grandes"],
 'API':["Respeta el plan gratis: 10 ms de CPU, ≤ 40 queries, ≤ 100 parámetros, escrituras con db.batch()","Toda consulta autenticada pasa por ScopedDb; cada cambio de permisos lleva test"],
 'Jobs':["El trabajo pesado corre en workers-py y escribe por /ingest firmado","Tests con uv run pytest"],
}
pend=[d for i,d in R.items() if i not in DONE and not d['estado'].startswith('Hecho') and d['estado']!='—']
def body(d):
    where=d['donde'] or ('Web, API' if d['id'][0] in 'ERK' else '')
    crit=["Hace lo que describe el ítem, con textos en es-PY con voseo vía i18n"]
    for k,v in CRIT.items():
        if k in where: crit+=v
    if d['id'][0] in 'AGE': crit.append("Sigue el modelo de `docs/adr/0004-modulos-campo-y-erp.md`")
    crit+=["Lint, typecheck y tests del paquete tocado pasan","Un commit (o más) con el ID del ítem en el mensaje"]
    est=f" · Estado en el backlog: {d['estado']}" if d['estado'] not in ('Falta',) else ''
    b=f"## Qué hay que hacer\n\n**{d['que']}**\n\n"
    if d['porque']: b+=f"Por qué: {d['porque']}.\n\n"
    b+=f"Sección: {d['sec']}" + (f" · Dónde: {where}" if where else '') + f" · Prioridad {d['prio']} · Esfuerzo {d['esf']}{est}\n\n"
    if d['id'] in blocked: b+=f"## Bloqueado\n\nNecesita: {blocked[d['id']]}. Se deja para cuando esté disponible.\n\n"
    b+="## Criterios de aceptación\n\n"+"\n".join(f"- [ ] {c}" for c in crit)
    b+="\n\nPrioridades: P0 imprescindible para mostrar, P1 antes de cobrar, P2 ventaja competitiva, P3 más adelante. Esfuerzo: S horas a 2 días, M 3 a 10 días, L más de 2 semanas.\n\nEste PR empieza con un commit vacío; los commits del ítem se suman acá cuando se resuelva."
    b+="\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n\nhttps://claude.ai/code/session_0121m53sSAVCQWNjm4XffNBA"
    return b
def sh(cmd):
    r=subprocess.run(cmd,shell=True,cwd='/home/user/yvy',capture_output=True,text=True)
    if r.returncode: raise SystemExit(cmd+r.stderr)
    return r.stdout.strip()
mode=sys.argv[1]
if mode=='push':
    sh("git fetch -q origin main")
    refs=[]
    for d in pend:
        sha=sh(f"git commit-tree 'origin/main^{{tree}}' -p origin/main -m \"{d['id']}: pendiente\"")
        refs.append(f"{sha}:refs/heads/claude/backlog-{d['id'].lower()}")
    import time as _t
    for i in range(0,len(refs),8):
        for k in range(4):
            r=subprocess.run("git push -q origin "+" ".join(refs[i:i+8]),shell=True,cwd="/home/user/yvy",capture_output=True,text=True)
            if r.returncode==0: break
            _t.sleep(2**(k+1))
        else: raise SystemExit("push falló en el lote "+str(i)+r.stderr)
    print(len(refs),'ramas')
else:
    have=json.loads(sh("gh api 'repos/gsmkev/yvy/pulls?state=all&per_page=100' --paginate -q '[.[].head.ref]' | jq -s add"))
    for d in pend:
        br=f"claude/backlog-{d['id'].lower()}"
        if br in have: continue
        title=f"{d['id']}: {d['que']}"[:240] + (" (bloqueado)" if d['id'] in blocked else "")
        json.dump({'title':title,'head':br,'base':'main','body':body(d),'draft':True},open(S+'/pp.json','w'))
        n=json.loads(sh(f"gh api repos/gsmkev/yvy/pulls --input {S}/pp.json"))['number']
        print(f"#{n} {d['id']}",flush=True)
        time.sleep(4)
