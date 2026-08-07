#  AI-Commit Assistant

A multi-model CLI tool that completely automates your Git commit messages and release notes using AI.

##  Features
* **Multi-Model Support:** Choose between Google Gemini, OpenAI (ChatGPT), or Anthropic Claude.
* **Micro Mode (`ai-commit`):** Automatically generates strict Conventional Commit messages based on your staged files.
* **Macro Mode (`ai-commit --release`):** Reads your commit history, generates a Markdown changelog, commits it, and drafts a GitHub release.
* **Cross-Platform:** Works seamlessly on Windows, Mac, and Linux.

##  Installation
npm install -g ai-commit-assistant

##  Setup

Set up your preferred AI provider (defaults to Gemini if not specified). The key is saved securely to your local machine.

ai-commit --set-key gemini "your_api_key_here"

*Supported providers: `gemini`, `openai`, `claude`*

To switch your default provider later:
ai-commit --set-provider claude

##  Usage

**1. Generate a Commit Message**
Stage your files and run the tool:
git add .
ai-commit

**2. Generate a Release & Changelog**
Ready to ship? Run the release command:
ai-commit --release