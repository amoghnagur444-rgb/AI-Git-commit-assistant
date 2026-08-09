#!/usr/bin/env node

import { execSync, execFileSync } from 'child_process';
import inquirer from 'inquirer';
import fs from 'fs'; 
import os from 'os';     
import path from 'path'; 

// AI SDKs
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

const MAX_DIFF_LENGTH = 20000;
const CONFIG_PATH = path.join(os.homedir(), '.aicommitrc');
const VALID_PROVIDERS = ['gemini', 'openai', 'claude'];

// ==========================================
// HELPER FUNCTIONS 
// ==========================================

// PATCH 1: Safe Config Loader with Auto-Migration
function loadConfig() {
    const defaultConfig = { provider: 'gemini', keys: {} };
    if (fs.existsSync(CONFIG_PATH)) {
        try { 
            const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')); 
            
            // MIGRATION: If they have V1.0 config, auto-upgrade them to V2.0 format
            if (parsed.GEMINI_API_KEY && !parsed.keys) {
                return {
                    provider: 'gemini',
                    keys: { gemini: parsed.GEMINI_API_KEY }
                };
            }
            
            // Ensure the structure is always safe to read
            return {
                provider: parsed.provider || 'gemini',
                keys: parsed.keys || {}
            };
        } 
        catch (e) { return defaultConfig; }
    }
    return defaultConfig;
}

function saveConfig(config) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// PATCH 2: Increased Token Limits for Claude
async function generateAIResponse(prompt, provider, apiKey) {
    if (provider === 'gemini') {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: prompt,
        });
        return response.text.trim();
    } 
    else if (provider === 'openai') {
        const openai = new OpenAI({ apiKey });
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini', 
            messages: [{ role: 'user', content: prompt }]
        });
        return response.choices[0].message.content.trim();
    } 
    else if (provider === 'claude') {
        const anthropic = new Anthropic({ apiKey });
        const response = await anthropic.messages.create({
            model: 'claude-3-haiku-20240307', 
            max_tokens: 4000, 
            messages: [{ role: 'user', content: prompt }]
        });
        return response.content[0].text.trim();
    }
    throw new Error('Unsupported AI provider.');
}

// ==========================================
// MAIN CLI LOGIC
// ==========================================
async function main() {
    let config = loadConfig();

    // 1. SETTINGS MANAGER: PROVIDERS & KEYS
    
    // Command: ai-commit --set-provider <provider>
    const setProviderIndex = process.argv.indexOf('--set-provider');
    if (setProviderIndex !== -1) {
        const newProvider = process.argv[setProviderIndex + 1]?.toLowerCase();
        if (!VALID_PROVIDERS.includes(newProvider)) {
            console.error('\x1b[31m%s\x1b[0m', `Error: Invalid provider. Choose from: ${VALID_PROVIDERS.join(', ')}`);
            process.exit(1);
        }
        config.provider = newProvider;
        saveConfig(config);
        console.log('\x1b[32m%s\x1b[0m', `Success: Default AI provider set to: ${newProvider}`);
        process.exit(0);
    }

    // Command: ai-commit --set-key <provider> <key>
    const setKeyIndex = process.argv.indexOf('--set-key');
    if (setKeyIndex !== -1) {
        const provider = process.argv[setKeyIndex + 1]?.toLowerCase();
        const newKey = process.argv[setKeyIndex + 2];
        
        if (!VALID_PROVIDERS.includes(provider) || !newKey || newKey.startsWith('--')) {
            console.error('\x1b[31m%s\x1b[0m', 'Error: Invalid format.');
            console.log('Usage: ai-commit --set-key <provider> <your_api_key>');
            console.log(`Available providers: ${VALID_PROVIDERS.join(', ')}`);
            process.exit(1);
        }
        
        config.keys[provider] = newKey;
        // Auto-switch default provider if this is their first key
        if (!config.keys[config.provider]) config.provider = provider;
        
        saveConfig(config);
        console.log('\x1b[32m%s\x1b[0m', `Success: API Key saved for ${provider}!`);
        process.exit(0);
    }

    // 2. AUTHENTICATION & ENVIRONMENT CHECK
    const activeProvider = config.provider;
    
    // Check config file first, fallback to system environment variables
    let apiKey = config.keys[activeProvider];
    if (!apiKey) {
        if (activeProvider === 'gemini') apiKey = process.env.GEMINI_API_KEY;
        if (activeProvider === 'openai') apiKey = process.env.OPENAI_API_KEY;
        if (activeProvider === 'claude') apiKey = process.env.ANTHROPIC_API_KEY;
    }

    if (!apiKey) {
        console.error('\x1b[31m%s\x1b[0m', `Error: No API Key found for your active provider (${activeProvider}).`);
        console.log('\x1b[36m%s\x1b[0m', 'Please set up your key by running:');
        console.log(`  ai-commit --set-key ${activeProvider} "your_api_key_here"`);
        console.log('\x1b[32m%s\x1b[0m', `Tip: You can switch providers using: ai-commit --set-provider <name>`);
        process.exit(1);
    }

    // 3. GLOBAL TOOL CHECK
    try {
        execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
    } catch (error) {
        console.error('\x1b[31m%s\x1b[0m', 'Error: The current directory is not a Git repository.');
        process.exitCode = 1;
        return;
    }

    console.warn('\x1b[33m%s\x1b[0m', 'Security Reminder: Ensure no sensitive API keys or passwords are in your code before proceeding.');

    // --- NEW SECURITY BLOCK ---
    const { isSafeToProceed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'isSafeToProceed',
        message: 'Are you sure your staged files/history are free of sensitive data?',
        default: false 
      }
    ]);

    if (!isSafeToProceed) {
      console.log('\x1b[31m%s\x1b[0m', 'Operation aborted. Please review your files and remove any sensitive data.');
      process.exitCode = 0;
      return;
    }

    const isReleaseMode = process.argv.includes('--release');

    if (isReleaseMode) {
        // ==========================================
        // MACRO MODE: GENERATE CHANGELOG & RELEASE
        // ==========================================
        const { versionTag } = await inquirer.prompt([
            {
                type: 'input',
                name: 'versionTag',
                message: 'Enter the version tag for this release (e.g., v1.0.0):',
                validate: input => input.length > 0 || 'Version tag is required!',
            }
        ]);

        console.log('\x1b[36m%s\x1b[0m', 'Reading Git history for release notes...');
        
        let commitHistory = '';
        try {
            commitHistory = execSync('git log -n 15 --pretty=format:"%h - %s%n%b"').toString();
        } catch (error) {
            console.error('\x1b[31m%s\x1b[0m', 'Error: No Git history found. You need at least one commit before creating a release!');
            process.exit(1);
        }

        if (!commitHistory.trim()) {
            console.warn('\x1b[33m%s\x1b[0m', 'Warning: No commit history found to generate a release.');
            process.exit(0);
        }

        console.log('\x1b[36m%s\x1b[0m', `Analyzing history with ${activeProvider.toUpperCase()}...`);

        const today = new Date().toISOString().split('T')[0];
        const prompt = `
You are an expert technical writer. Read the following git commit history and compile a professional GitHub Release / Changelog entry. 
Format the output strictly as Markdown with these sections:
## ${versionTag.trim()} - ${today}
### Features
### Bug Fixes
### Maintenance

Here is the raw commit history:
${commitHistory}
`;
        try {
            const releaseNotes = await generateAIResponse(prompt, activeProvider, apiKey);

            console.log('\n\x1b[32m%s\x1b[0m', '----------------------------------------');
            console.log(releaseNotes);
            console.log('\x1b[32m%s\x1b[0m', '----------------------------------------\n');

            const { writeRelease } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'writeRelease',
                    message: 'Do you want to append these notes to a CHANGELOG.md file?',
                    default: true,
                }
            ]);

            if (writeRelease) {
                fs.appendFileSync('CHANGELOG.md', '\n\n' + releaseNotes);
                console.log('\n\x1b[32m%s\x1b[0m', 'Success: CHANGELOG.md updated successfully!');
                
                const { commitChangelog } = await inquirer.prompt([
                    {
                        type: 'confirm',
                        name: 'commitChangelog',
                        message: 'Do you want to commit the updated CHANGELOG.md to your repository?',
                        default: true,
                    }
                ]);

                if (commitChangelog) {
                    execSync('git add CHANGELOG.md');
                    execSync(`git commit -m "chore(release): generate changelog for ${versionTag.trim()}"`);
                    console.log('\x1b[32m%s\x1b[0m', 'Success: CHANGELOG.md committed.');
                }

                const { pushCode } = await inquirer.prompt([
                    {
                        type: 'confirm',
                        name: 'pushCode',
                        message: 'Do you want to push your latest code to GitHub now?',
                        default: true,
                    }
                ]);

                if (pushCode) {
                    console.log('\x1b[36m%s\x1b[0m', 'Pushing code to GitHub remote...');
                    try {
                        const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
                        execSync(`git push -u origin ${branch}`, { stdio: 'inherit' });
                    } catch (pushErr) {
                        console.error('\x1b[31m%s\x1b[0m', 'Error: Could not push. Have you set up your GitHub remote?');
                        process.exit(1); 
                    }
                }
                
                const { pushToGitHub } = await inquirer.prompt([
                    {
                        type: 'confirm',
                        name: 'pushToGitHub',
                        message: 'Do you want to generate the GitHub Draft Release now?',
                        default: false,
                    }
                ]);

                if (pushToGitHub) {
                    console.log('\x1b[36m%s\x1b[0m', 'Uploading draft release to GitHub...');
                    try {
                        execFileSync('gh', ['release', 'create', versionTag.trim(), '-t', versionTag.trim(), '-n', releaseNotes, '--draft'], { stdio: 'inherit' });
                        console.log('\n\x1b[32m%s\x1b[0m', 'Success: Draft release safely uploaded to GitHub!');
                    } catch (ghError) {
                        console.error('\x1b[31m%s\x1b[0m', 'Error: Communicating with GitHub CLI. Code aborted.');
                    }
                }
            } else {
                console.log('\x1b[33m%s\x1b[0m', 'Aborted. CHANGELOG.md was not changed.');
            }
        } catch (error) {
            console.error('\x1b[31m%s\x1b[0m', `Error: Communicating with ${activeProvider.toUpperCase()} API:`);
            console.error(error.message);
            
            // Graceful exit: Allows Windows network sockets to close properly
            process.exitCode = 1;
            return; 
        }
    } else {
        // ==========================================
        // MICRO MODE: GENERATE COMMIT MESSAGE
        // ==========================================
        let diff = '';
        try {
            diff = execSync('git diff --staged').toString();
        } catch (error) {
            console.error('\x1b[31m%s\x1b[0m', 'Error: Failed to execute git diff. Ensure you are in a valid git repository.');
            process.exit(1);
        }

        if (!diff.trim()) {
            console.log('\x1b[33m%s\x1b[0m', 'Warning: No staged files found!');
            console.log('\x1b[36m%s\x1b[0m', 'Run `git add .` or stage specific files before running this tool.');
            process.exit(0);
        }

        if (diff.length > MAX_DIFF_LENGTH) {
            console.error('\x1b[31m%s\x1b[0m', 'Error: Payload Too Large. The staged changes are too massive for AI processing.');
            console.log('\x1b[33m%s\x1b[0m', '  1. Initial Commit: Stage folders one by one, or type a manual commit.');
            console.log('  2. Build Folders: Ensure `.gitignore` is ignoring node_modules/ or build/.');
            process.exit(1);
        }

        console.log('\x1b[36m%s\x1b[0m', `Analyzing staged changes with ${activeProvider.toUpperCase()}...`);
        
        try {
            const prompt = `
You are an expert software developer. Analyze the following git diff and provide:
1. A strict, single-line Conventional Commit message at the very top.
2. A blank line.
3. A header "### Release Notes" followed by a concise, user-facing bulleted list of what changed.

Do NOT wrap your response in markdown code blocks (\`\`\`). Output raw, readable text.

Git Diff:
${diff}
`;
            const outputText = await generateAIResponse(prompt, activeProvider, apiKey);

            console.log('\n\x1b[32m%s\x1b[0m', '----------------------------------------');
            console.log(outputText);
            console.log('\x1b[32m%s\x1b[0m', '----------------------------------------\n');

            const { applyCommit } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'applyCommit',
                    message: 'Do you want to apply this commit?',
                    default: true,
                }
            ]);

            if (applyCommit) {
                console.log('\x1b[36m%s\x1b[0m', 'Committing changes...');
                execFileSync('git', ['commit', '-m', outputText], { stdio: 'inherit' });
                console.log('\n\x1b[32m%s\x1b[0m', 'Success: Commit successful!');
            } else {
                console.log('\x1b[33m%s\x1b[0m', 'Aborted. Your files are still staged.');
            }
            
        } catch (error) {
            console.error('\x1b[31m%s\x1b[0m', `Error: Communicating with ${activeProvider.toUpperCase()} API:`);
            console.error(error.message);
            
            // Graceful exit: Allows Windows network sockets to close properly
            process.exitCode = 1;
            return; 
        }
    }
}

main();