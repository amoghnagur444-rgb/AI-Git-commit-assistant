# 🚀 AI Git Commit Assistant

An AI-powered CLI tool that automatically reads your staged Git changes and generates precise Conventional Commit messages and user-facing Release Notes instantly.

Powered by Google's lightning-fast **Gemini 3.6 Flash** model.

## ✨ Features

- **Blazing Fast**: Uses Gemini 3.6 Flash for sub-second terminal responses.
- **Privacy & Security First**: Bring your own API key. No keys are ever hardcoded or tracked.
- **Laser Focused**: Only analyzes staged files (`git diff --staged`), giving you full control over what the AI sees.
- **Smart Truncation**: Automatically trims massive file diffs to prevent API token limits.
- **Standardized Output**: Guarantees standard "Conventional Commit" formatting (e.g., `feat:`, `fix:`, `chore:`).

## 📦 Installation

Install the package globally via NPM so you can use it in any project folder on your machine:

```bash
npm install -g ai-commit