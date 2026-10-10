"use server";

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

/**
 * Run a Python script with JSON stdin/stdout communication.
 * Resolves scripts from both `scripts/` and `python_tools/` directories.
 */
export async function runPythonScript(scriptName: string, inputData: any, args: string[] = []) {
  return new Promise((resolve) => {
    const sanitizedScriptName = path.basename(scriptName);
    let scriptPath = path.join(process.cwd(), 'scripts', sanitizedScriptName);

    if (!fs.existsSync(scriptPath)) {
      scriptPath = path.join(process.cwd(), 'python_tools', sanitizedScriptName);
    }

    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const pythonProcess = spawn(pythonCmd, [scriptPath, ...args]);
    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => { stdout += data.toString(); });
    pythonProcess.stderr.on('data', (data) => { stderr += data.toString(); });

    pythonProcess.stdin.write(JSON.stringify(inputData));
    pythonProcess.stdin.end();

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`Python script error [${sanitizedScriptName}]:`, stderr);
        resolve({ success: false, message: `Script exited with code ${code}`, error: stderr });
      } else {
        try {
          const parsed = extractJsonFromOutput(stdout);
          resolve({ success: true, data: parsed });
        } catch (e) {
          resolve({ success: true, data: stdout.trim() });
        }
      }
    });

    pythonProcess.on('error', (err) => {
      console.error(`Failed to start Python process:`, err);
      resolve({ success: false, message: `Process error: ${err.message}` });
    });
  });
}

/**
 * Extract JSON from Python stdout, handling any non-JSON prefix/suffix.
 */
function extractJsonFromOutput(stdout: string): any {
  const firstBrace = stdout.indexOf('{');
  const firstBracket = stdout.indexOf('[');
  let startIdx = -1;

  if (firstBrace !== -1 && firstBracket !== -1) {
    startIdx = Math.min(firstBrace, firstBracket);
  } else if (firstBrace !== -1) {
    startIdx = firstBrace;
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
  }

  const lastBrace = stdout.lastIndexOf('}');
  const lastBracket = stdout.lastIndexOf(']');
  let endIdx = -1;

  if (lastBrace !== -1 && lastBracket !== -1) {
    endIdx = Math.max(lastBrace, lastBracket);
  } else if (lastBrace !== -1) {
    endIdx = lastBrace;
  } else if (lastBracket !== -1) {
    endIdx = lastBracket;
  }

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const cleanJson = stdout.substring(startIdx, endIdx + 1);
    return JSON.parse(cleanJson);
  }

  return JSON.parse(stdout);
}

/**
 * Run bridge.py with a specific action. Single spawn handles the full workflow.
 */
export async function runBridge(inputData: { action: string; [key: string]: any }) {
  return runPythonScript('bridge.py', inputData);
}
