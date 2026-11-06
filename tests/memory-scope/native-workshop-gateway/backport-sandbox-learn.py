"""Patch the pinned OpenClaw main with per-contribution /learn sandbox admission.

The upstream default remains fail-closed for ordinary Workshop and memory
providers. Only an explicitly sandbox-compatible contribution reaches the
existing model/tool policy checks. Stop if the pinned source shape changes.
"""
from pathlib import Path
import sys

root=Path(sys.argv[1]).resolve()
types=root/'src/plugins/registry-contribution-types.ts'
commands=root/'src/auto-reply/reply/commands-learn.ts'
assert types.is_file() and commands.is_file()

source=types.read_text(encoding='utf-8')
anchor='''  /** Tools that must all be allowed for this contribution to learn; default: any of toolNames. */
  requiredToolNames?: readonly string[];
'''
assert source.count(anchor)==1
types.write_text(source.replace(anchor,anchor+'  /** Explicitly allow this contribution in a sandboxed turn when its tools use host-side scoped authorization. Does not grant tool policy. */\n  sandboxCompatible?: boolean;\n'),encoding='utf-8')

source=commands.read_text(encoding='utf-8')
blanket='''  // Learned skills live on the host under the agent dir, and memory providers deny
  // sandboxed callers, so a sandboxed session can learn into neither.
  if (sandboxRuntime.sandboxed) {
    return [];
  }

'''
anchor='''    return contributors.flatMap((contributor) => {
      const { toolNames, requiredToolNames } = contributor.contribution;
'''
assert source.count(blanket)==1 and source.count(anchor)==1
source=source.replace(blanket,'').replace(anchor,'''    return contributors.flatMap((contributor) => {
      // Host-backed providers may explicitly support sandboxed callers. Tool
      // availability and the provider's own authorization still apply below.
      if (sandboxRuntime.sandboxed && !contributor.contribution.sandboxCompatible) {
        return [];
      }
      const { toolNames, requiredToolNames } = contributor.contribution;
''')
commands.write_text(source,encoding='utf-8')
print('Applied per-contribution /learn sandbox admission to pinned OpenClaw main')
