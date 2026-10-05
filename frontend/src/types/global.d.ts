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
  // Must repeat @types/react's own type parameters exactly (TS requires identical
  // parameters on every declaration of an interface), `any` defaults included.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface ReactElement<P = any, T extends string | JSXElementConstructor<any> = string | JSXElementConstructor<any>> {
    type: T;
    props: P;
    key: Key | null;
  }
}
