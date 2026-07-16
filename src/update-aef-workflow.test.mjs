import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workflowPath = path.resolve(__dirname, '..', '.github', 'workflows', 'update-aef-data.yml');
const workflow = fs.readFileSync(workflowPath, 'utf8');
const workflowDispatchBlock = workflow.match(/workflow_dispatch:\n[\s\S]*?\npermissions:/)?.[0] ?? '';

test('workflow_dispatch defines force_update boolean input with default false', () => {
  assert.ok(workflowDispatchBlock.length > 0, 'workflow_dispatch block should exist');
  assert.match(workflowDispatchBlock, /\n\s+force_update:\n/);
  assert.ok(
    workflowDispatchBlock.includes("force_update:\n        description: 'Force rebuild and overwrite previously generated data"),
    'force_update description should explain overwrite behavior',
  );
  assert.match(workflowDispatchBlock, /\n\s+force_update:\n[\s\S]*?\n\s+type:\s+boolean\n/);
  assert.match(workflowDispatchBlock, /\n\s+force_update:\n[\s\S]*?\n\s+default:\s+false\n/);
});

test('force_update affects build gate and logs decision context', () => {
  assert.match(workflow, /FORCE_UPDATE_INPUT_FROM_DISPATCH:\s+\$\{\{\s*github\.event_name == 'workflow_dispatch' && inputs\.force_update \|\| ''\s*\}\}/);
  assert.match(workflow, /if \[ "\$FORCE_UPDATE_INPUT_FROM_DISPATCH" = 'true' \]; then/);
  assert.match(workflow, /if \[ "\$EVENT_NAME" = 'workflow_dispatch' \] && \[ "\$force_update_input" = 'true' \]/);
  assert.match(workflow, /echo "should_build=\$should_build" >> "\$GITHUB_OUTPUT"/);
  assert.match(workflow, /if:\s+steps\.check\.outputs\.should_build == 'true'/);
  assert.match(workflow, /echo "Workflow event: \$EVENT_NAME"/);
  assert.match(workflow, /echo "force_update: \$force_update_input"/);
  assert.match(workflow, /echo "decision reason: \$reason"/);
});
