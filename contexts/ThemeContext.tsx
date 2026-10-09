import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export const lightTheme = {
  bg: '#F9FAFB',
  card: '#FFFFFF',
  text: '#111827',
  textMuted: '#6B7280',
  border: '#E5E7EB',
  primary: '#FF6B00',
  btnSecondary: '#F3F4F6'
};

export const darkTheme = {
  bg: '#121212',
  card: '#1C1C1E',
  text: '#FFFFFF',
  textMuted: '#8E8E93',
  border: '#2C2C2E',
  primary: '#FF6B00',
  btnSecondary: '#2C2C2E'
};

type ThemeContextType = {
  isDarkMode: boolean;
  colors: typeof lightTheme;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isManualDark, setIsManualDark] = useState<boolean | null>(null);
  const [isTimeDark, setIsTimeDark] = useState<boolean>(false);

  useEffect(() => {
    const checkTime = () => {
      const hour = new Date().getHours();
      // Automatically switch to dark mode between 6:00 PM (18) and 6:00 AM (6)
      setIsTimeDark(hour >= 18 || hour < 6);
    };
    
    checkTime();
    const interval = setInterval(checkTime, 60000); // Check every minute
    
    return () => clearInterval(interval);
  }, []);

  const isDarkMode = isManualDark !== null ? isManualDark : isTimeDark;
  const colors = isDarkMode ? darkTheme : lightTheme;

  const toggleTheme = () => {
    setIsManualDark(!isDarkMode);
  };

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