#!/usr/bin/env node

import { execSync, execFileSync } from 'child_process';
import { GoogleGenAI } from '@google/genai';
import inquirer from 'inquirer'; // 👈 Added inquirer

const MAX_DIFF_LENGTH = 20000;

async function main() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('\x1b[31m%s\x1b[0m', '❌ Error: GEMINI_API_KEY environment variable is not set.');
        console.error('Please set it using: export GEMINI_API_KEY="your_api_key"');
        process.exit(1);
    }

    try {
        execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
    } catch (error) {
        console.error('\x1b[31m%s\x1b[0m', '❌ Error: The current directory is not a Git repository.');
        process.exit(1);
    }

    let diff = '';
    try {
        diff = execSync('git diff --staged').toString();
    } catch (error) {
        console.error('\x1b[31m%s\x1b[0m', '❌ Error: Failed to execute git diff.');
        process.exit(1);
    }

    if (!diff.trim()) {
        console.warn('\x1b[33m%s\x1b[0m', '⚠️  No staged changes found.');
        console.log('Please stage your files first using: git add <file> or git add .');
        process.exit(0);
    }

    if (diff.length > MAX_DIFF_LENGTH) {
        console.warn('\x1b[33m%s\x1b[0m', `⚠️  Diff exceeds ${MAX_DIFF_LENGTH} characters. Truncating for AI analysis...`);
        diff = diff.substring(0, MAX_DIFF_LENGTH);
    }

    console.log('\x1b[36m%s\x1b[0m', '✨ Analyzing staged changes with Gemini 3.6 Flash...');
    
    try {
        const ai = new GoogleGenAI({ apiKey: apiKey });

        const prompt = `
You are an expert software developer. Analyze the following git diff and provide:
1. A strict, single-line Conventional Commit message at the very top (e.g., feat: add login authentication).
2. A blank line.
3. A header "### Release Notes" followed by a concise, user-facing bulleted list of what changed.

Do NOT wrap your response in markdown code blocks (\`\`\`). Output raw, readable text.

Git Diff:
${diff}
`;

        const response = await ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: prompt,
        });

        const outputText = response.text.trim();

        // Print the result cleanly to the terminal
        console.log('\n\x1b[32m%s\x1b[0m', '----------------------------------------');
        console.log(outputText);
        console.log('\x1b[32m%s\x1b[0m', '----------------------------------------\n');

        // 👈 NEW: The Interactive Prompt
        const { applyCommit } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'applyCommit',
                message: 'Do you want to apply this commit?',
                default: true,
            }
        ]);

        if (applyCommit) {
            console.log('\x1b[36m%s\x1b[0m', '🚀 Committing changes...');
            // We use execFileSync to safely pass multi-line strings directly to git
            execFileSync('git', ['commit', '-m', outputText], { stdio: 'inherit' });
            console.log('\n\x1b[32m%s\x1b[0m', '✅ Commit successful!');
        } else {
            console.log('\x1b[33m%s\x1b[0m', '❌ Commit aborted. Your files are still staged.');
        }
        
    } catch (error) {
        console.error('\x1b[31m%s\x1b[0m', '❌ Error communicating with Google Gemini API:');
        console.error(error.message);
        process.exit(1);
    }
}

main();