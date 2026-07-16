import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workflowPath = path.resolve(__dirname, '..', '.github', 'workflows', 'update-aef-data.yml');
const workflow = fs.readFileSync(workflowPath, 'utf8');

test('workflow_dispatch defines force_update boolean input with default false', () => {
  assert.match(workflow, /\n\s+force_update:\n/);
  assert.match(workflow, /\n\s+force_update:\n[\s\S]*?\n\s+type:\s+boolean\n/);
  assert.match(workflow, /\n\s+force_update:\n[\s\S]*?\n\s+default:\s+false\n/);
});

test('force_update affects build gate and logs decision context', () => {
  assert.match(workflow, /FORCE_UPDATE_INPUT:\s+\$\{\{\s*github\.event_name == 'workflow_dispatch'/);
  assert.match(workflow, /if \[ "\$EVENT_NAME" = 'workflow_dispatch' \] && \[ "\$FORCE_UPDATE_INPUT" = 'true' \]/);
  assert.match(workflow, /echo "should_build=\$should_build" >> "\$GITHUB_OUTPUT"/);
  assert.match(workflow, /if:\s+steps\.check\.outputs\.should_build == 'true'/);
  assert.match(workflow, /echo "Workflow event: \$EVENT_NAME"/);
  assert.match(workflow, /echo "force_update: \$FORCE_UPDATE_INPUT"/);
  assert.match(workflow, /echo "decision reason: \$reason"/);
});
