# Troubleshooting Guide

This guide addresses common issues you might encounter while working with the Near & Now React application.

## 🔍 Table of Contents

1. [Installation Issues](#installation-issues)
2. [Development Server Issues](#development-server-issues)
3. [TypeScript Errors](#typescript-errors)
4. [React Component Issues](#react-component-issues)
5. [API Integration Issues](#api-integration-issues)
6. [Styling Issues](#styling-issues)
7. [Build and Deployment Issues](#build-and-deployment-issues)

## Installation Issues

### npm install fails

**Problem**: `npm install` command fails with errors.

**Solutions**:
1. Clear npm cache:
   ```bash
   npm cache clean --force
   ```

2. Delete node_modules and reinstall:
   ```bash
   rm -rf node_modules
   npm install
   ```

3. Check Node.js version:
   ```bash
   node -v
   ```
   Make sure you're using Node.js v16 or higher.

### Package version conflicts

**Problem**: Dependency version conflicts during installation.

**Solutions**:
1. Update package.json with compatible versions
2. Use `--force` flag:
   ```bash
   npm install --force
   ```

## Development Server Issues

### Server won't start

**Problem**: `npm run dev` fails to start the development server.

**Solutions**:
1. Check if port 5173 is already in use:
   ```bash
   # Windows
   netstat -ano | findstr :5173
   
   # Mac/Linux
   lsof -i :5173
   ```

2. Kill the process using the port:
   ```bash
   # Windows (replace PID with the process ID from above)
   taskkill /F /PID <PID>
   
   # Mac/Linux
   kill -9 <PID>
   ```

3. Try using a different port:
   ```bash
   npm run dev -- --port 3000
   ```

### Hot reloading not working

**Problem**: Changes to files don't trigger automatic reloading.

**Solutions**:
1. Check if you have saved the file
2. Restart the development server
3. Check for errors in the console
4. Make sure you're not using a file watcher limit (common on Windows)

## TypeScript Errors

### JSX element implicitly has type 'any'

**Problem**: TypeScript error about JSX elements having implicit 'any' type.

**Solutions**:
1. Make sure `tsconfig.json` is properly configured with `"jsx": "react-jsx"`
2. Check that you have `@types/react` and `@types/react-dom` installed
3. Add the following to a declaration file (e.g., `src/react-app-env.d.ts`):
   ```typescript
   /// <reference types="react" />
   /// <reference types="react-dom" />
   ```

### Could not find a declaration file for module

**Problem**: TypeScript can't find type definitions for a module.

**Solutions**:
1. Install the corresponding @types package:
   ```bash
   npm install --save-dev @types/module-name
   ```

2. Create a declaration file in `src/types`:
   ```typescript
   // src/types/module-name.d.ts
   declare module 'module-name';
   ```

## React Component Issues

### Component not rendering

**Problem**: A component is not rendering or displaying correctly.

**Solutions**:
1. Check the console for errors
2. Verify that the component is being imported and used correctly
3. Make sure the component is returning valid JSX
4. Check if conditional rendering logic is preventing the component from showing

### Context value is undefined

**Problem**: `useContext` hook returns undefined.

**Solutions**:
1. Make sure the component is wrapped in the corresponding provider
2. Check that the context is exported and imported correctly
3. Verify the provider value is being set properly

### Infinite re-renders

**Problem**: Component keeps re-rendering in an infinite loop.

**Solutions**:
1. Check your `useEffect` dependencies array
2. Look for state updates that might be triggering re-renders
3. Use the React DevTools to identify what's causing the re-renders
4. Use `useCallback` or `useMemo` to memoize functions or values

## API Integration Issues

### Supabase connection fails

**Problem**: Cannot connect to Supabase or API calls fail.

**Solutions**:
1. Check your Supabase URL and API key in `.env` file
2. Verify that the environment variables are being loaded correctly
3. Check network requests in the browser DevTools
4. Make sure Supabase service is up and running

### CORS errors

**Problem**: Cross-Origin Resource Sharing (CORS) errors when making API requests.

**Solutions**:
1. Check if your Supabase project has the correct CORS settings
2. Make sure your API requests include the necessary headers
3. For development, consider using a CORS proxy

## Styling Issues

### Tailwind classes not working

**Problem**: Tailwind CSS classes are not being applied.

**Solutions**:
1. Check that Tailwind is properly configured in `tailwind.config.js`
2. Make sure PostCSS is configured correctly
3. Verify that the Tailwind directives are in your CSS file:
   ```css
   @tailwind base;
   @tailwind components;
   @tailwind utilities;
   ```
4. Try clearing your browser cache

### Layout breaks on mobile

**Problem**: Layout doesn't look right on mobile devices.

**Solutions**:
1. Use responsive design utilities from Tailwind (e.g., `sm:`, `md:`, `lg:` prefixes)
2. Test with browser DevTools in mobile view
3. Add appropriate meta viewport tag in HTML:
   ```html
   <meta name="viewport" content="width=device-width, initial-scale=1.0">
   ```

## Build and Deployment Issues

### Build fails

**Problem**: `npm run build` command fails.

**Solutions**:
1. Check the error messages for specific issues
2. Fix TypeScript errors and warnings
3. Make sure all dependencies are installed
4. Check for case sensitivity issues in imports (important for deployment)

### Images or assets missing in build

**Problem**: Images or other assets are missing in the production build.

**Solutions**:
1. Make sure assets are in the `public` directory or imported correctly
2. Use relative paths for assets in the `public` directory
3. For imported assets, check that the import path is correct

### Environment variables not working in production

**Problem**: Environment variables are undefined in the production build.

**Solutions**:
1. Make sure environment variables are prefixed with `VITE_` (e.g., `VITE_API_KEY`)
2. Check that `.env` file is in the project root
3. For production, set environment variables on the hosting platform

## Still Having Issues?

If you're still experiencing problems:

1. Search for similar issues on the React, Vite, or Tailwind documentation
2. Check Stack Overflow for solutions to common problems
3. Review the project documentation for specific guidance
4. Reach out to the project maintainers for help

Remember to provide detailed information about your issue, including:
- Error messages
- Steps to reproduce
- Environment details (OS, browser, Node.js version)
- Code snippets related to the issue
