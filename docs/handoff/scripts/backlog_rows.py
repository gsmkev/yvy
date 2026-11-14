import re
def rows(path='/home/user/yvy/docs/BACKLOG.md'):
    out={}; sec=''
    for line in open(path):
        m=re.match(r'^## (\d+)\. (.+)',line)
        if m: sec=m.group(2).strip(); continue
        m=re.match(r'^\| ([A-Z]-\d+) \|',line)
        if not m: continue
        c=[x.strip() for x in line.strip().strip('|').split('|')]
        d={'id':c[0],'que':c[1],'sec':sec,'prio':c[-3],'esf':c[-2],'estado':c[-1]}
        if len(c)>=7: d['porque']=c[2]; d['donde']=c[3]
        elif len(c)==6: d['porque']=c[2]; d['donde']=''
        else: d['porque']=''; d['donde']=''
        out[c[0]]=d
    return out
