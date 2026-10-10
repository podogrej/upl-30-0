import base64,sys
F='/home/user/upl-30-0/.claude/worktrees/agent-a7db1d8ab9656a915/fonts/KyivTypeSans-%s.otf'
s=open(sys.argv[1]).read()
for k,n in (('REGULAR','Regular'),('BOLD','Bold'),('BLACK','Black')):
    s=s.replace('__FONT_%s__'%k,base64.b64encode(open(F%n,'rb').read()).decode())
open(sys.argv[2],'w').write(s)
