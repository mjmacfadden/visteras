# Visteras Firebase Functions

Secure proxy functions for third-party APIs (Pixabay, etc.) to keep API keys secure while hosting the main client-side app statically on GitHub Pages.

## Deployment Instructions

1. **Install Firebase CLI** (if not already installed):
   ```bash
   npm install -g firebase-tools
   ```

2. **Login & Initialize** in project root:
   ```bash
   firebase login
   firebase init functions
   ```

3. **Set the Pixabay API Key Secret**:
   ```bash
   firebase functions:secrets:set PIXABAY_API_KEY
   # Enter your Pixabay API key when prompted
   ```

4. **Deploy the Function**:
   ```bash
   firebase deploy --only functions
   ```

5. **Copy the Function URL**:
   Your function will be available at:
   `https://<region>-<project-id>.cloudfunctions.net/pixabaySearch`
