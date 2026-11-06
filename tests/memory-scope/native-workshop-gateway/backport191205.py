"""Apply the unmerged sandbox-fact projection from openclaw/openclaw#191205.

The pinned upstream tree must match exactly; fail closed if main has moved or
already incorporated the change, so the compatibility proof stays attributable.
"""
from pathlib import Path
import sys

root=Path(sys.argv[1]).resolve()
file=root/'src/agents/embedded-agent-runner/run/attempt.ts'
assert file.is_file()
source=file.read_text(encoding='utf-8')
anchor='''    sandbox,
    sessionAgentId,
  } = setup;

  let restoreSkillEnv'''
replacement='''    sandbox,
    sessionAgentId,
  } = setup;
  // Hooks consume this attempt snapshot, while tools consume setup. Publish the
  // same prepared sandbox fact without trusting or mutating the caller's input.
  params = { ...params, sandbox: sandbox ?? undefined };

  let restoreSkillEnv'''
assert source.count(anchor)==1, 'Pinned upstream source changed or patch already applied'
file.write_text(source.replace(anchor,replacement),encoding='utf-8')
print('Applied openclaw/openclaw#191205 sandbox fact projection')
