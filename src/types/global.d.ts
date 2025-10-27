/// <reference types="vitest" />
/// <reference types="@testing-library/jest-dom" />

declare module 'vitest' {
  export * from 'vitest/globals';
}

declare module '@testing-library/react' {
  export * from '@testing-library/react';
}

declare module 'react/jsx-runtime' {
  export * from 'react/jsx-runtime';
}

declare namespace React {
  interface ReactElement<P = any, T extends string | JSXElementConstructor<any> = string | JSXElementConstructor<any>> {
    type: T;
    props: P;
    key: Key | null;
  }
}
