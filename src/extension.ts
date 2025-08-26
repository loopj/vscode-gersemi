import { spawn } from 'node:child_process';
import * as fs from 'node:fs';

import * as vscode from 'vscode';

// DocumentFormattingEditProvider implementation for CMake files using gersemi
class GersemiFormatter implements vscode.DocumentFormattingEditProvider {
  // Called by VS Code when formatting is requested
  async provideDocumentFormattingEdits(document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
    const input = document.getText();

    // Format using gersemi CLI
    const formatted = await runGersemi(document.fileName, input);
    if (formatted === null) return [];

    // Replace the entire document with formatted output
    const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(input.length));
    return [vscode.TextEdit.replace(fullRange, formatted)];
  }
}

// Runs the gersemi CLI, passing input via stdin and returning formatted output
function runGersemi(_filename: string, input: string): Promise<string | null> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';

    // Check for .gersemirc config in workspace root
    let configPath: string | undefined;
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (folder) {
      const possiblePath = vscode.Uri.joinPath(folder.uri, '.gersemirc').fsPath;
      if (fs.existsSync(possiblePath)) {
        configPath = possiblePath;
      }
    }

    // Prepare CLI arguments for gersemi
    const args = ['-'];
    if (configPath) {
      args.push('--config', configPath);
    }

    // Spawn gersemi process
    const child = spawn('gersemi', args);

    // Collect stdout and stderr
    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    // Resolve promise on process close
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else {
        // Show error in VS Code if formatting fails
        vscode.window.showErrorMessage(`gersemi failed: ${stderr}`);
        resolve(null);
      }
    });

    // Send input to gersemi
    child.stdin.write(input);
    child.stdin.end();
  });
}

// Called by VS Code when the extension is activated
export function activate(context: vscode.ExtensionContext) {
  const provider = new GersemiFormatter();
  context.subscriptions.push(
    // Register the formatter for CMake files
    vscode.languages.registerDocumentFormattingEditProvider('cmake', provider),

    // Register the manual format command
    vscode.commands.registerCommand('gersemi.formatDocument', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      // Format the current document using gersemi
      const formatted = await runGersemi(editor.document.fileName, editor.document.getText());
      if (formatted !== null) {
        editor.edit((builder: vscode.TextEditorEdit) => {
          const fullRange = new vscode.Range(
            editor.document.positionAt(0),
            editor.document.positionAt(editor.document.getText().length),
          );
          builder.replace(fullRange, formatted);
        });
      }
    }),
  );
}

// Called by VS Code when the extension is deactivated
export function deactivate() {}
