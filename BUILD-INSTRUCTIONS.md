# iOS Build Instructions for CalendarOCR

## Step 1: Open Terminal
1. Open the **Terminal** app on your Mac
2. Navigate to your project:
   ```bash
   cd /Users/bowenjiang/Desktop/CalendarOCR
   ```

## Step 2: Run the Build Command
```bash
npx eas build --platform ios --profile production
```

## Step 3: Answer the Prompts

When prompted, answer as follows:

### 1. **"Do you want to log in to your Apple account?"**
   → Answer: **YES** (press `y` then Enter)

### 2. **"Apple ID:"**
   → Enter: **bowenj2005@outlook.com**

### 3. **"Password:"**
   → Enter your Apple ID password (the one you use for App Store Connect)

### 4. **"Select an authentication method:"**
   → Select **SMS** or **Trusted device** (whichever you prefer for 2FA)

### 5. **"Enter the verification code:"**
   → Enter the 6-digit code sent to your phone/device

### 6. **"Generate a new Apple Distribution Certificate?"**
   → Answer: **YES** (press `y` then Enter)

### 7. **"Generate a new Apple Provisioning Profile?"**
   → Answer: **YES** (press `y` then Enter)

## Step 4: Wait for Build

The build will now start on EAS servers. This takes **15-30 minutes**.

You'll see:
```
✔ Build started
✔ Build link: https://expo.dev/accounts/[your-account]/projects/CalendarOCR/builds/[build-id]
```

## Step 5: When Build Completes

You'll receive:
- Email notification
- Download link for the `.ipa` file

Then we can proceed to upload it to App Store Connect!

---

## Troubleshooting

**If you see "command not found: npx":**
```bash
npm install -g npm
```

**If you see authentication errors:**
- Make sure you're using the correct Apple ID password
- Check that 2FA is enabled on your Apple account
- Try logging out and back in to appleid.apple.com first
