Исправление ошибки Expo Web на Vercel:

CommandError: It looks like you're trying to use web support but don't have the required dependencies installed.

Что изменено:
- добавлены зависимости в apps/mobile/package.json:
  - react-native-web@~0.19.10
  - react-dom@18.2.0
  - @expo/metro-runtime@~3.2.3

Применение:
1. Распаковать архив в корень репозитория familyfinance с заменой apps/mobile/package.json.
2. Commit to main.
3. Push origin.
4. В Vercel webapp-проекте Redeploy.

Настройки Vercel для webapp:
- Root Directory: apps/mobile
- Install Command: npm install
- Build Command: npm run build:web
- Output Directory: dist
- Env: EXPO_PUBLIC_API_URL=https://<backend-url>.vercel.app
