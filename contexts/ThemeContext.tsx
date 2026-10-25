import React, { createContext, useContext, useState, ReactNode } from 'react';

export const lightTheme = {
  bg: '#F9FAFB',
  card: '#FFFFFF',
  input: '#F3F4F6',
  softCard: '#EEF2FF',
  text: '#111827',
  textMuted: '#6B7280',
  border: '#E5E7EB',
  primary: '#FF6B00',
  btnSecondary: '#F3F4F6',
  overlay: 'rgba(15, 23, 42, 0.48)',
};

export const darkTheme = {
  bg: '#0B1220',
  card: '#111827',
  input: '#1E293B',
  softCard: '#172554',
  text: '#F8FAFC',
  textMuted: '#A8B3C7',
  border: '#293548',
  primary: '#FF6B00',
  btnSecondary: '#1E293B',
  overlay: 'rgba(2, 6, 23, 0.72)',
};

type ThemeContextType = {
  isDarkMode: boolean;
  colors: typeof lightTheme | typeof darkTheme;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDarkMode, setIsDarkMode] = useState(false);

  const toggleTheme = () => setIsDarkMode((prev) => !prev);
  const colors = isDarkMode ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider value={{ isDarkMode, colors, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useAppTheme must be used within a ThemeProvider");
  return context;
}