#!/bin/bash
# iOS Build Script for CalendarOCR

echo "🚀 Starting iOS build for CalendarOCR..."
echo ""
echo "When prompted:"
echo "  - Generate Distribution Certificate? → YES"
echo "  - Generate Provisioning Profile? → YES"
echo ""

npx eas build --platform ios --profile production
