import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { colors as mechanicPalette } from '@/lib/theme';

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

type ThemeColors = {
  bg: string;
  card: string;
  input: string;
  softCard: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
  btnSecondary: string;
  overlay: string;
};

type ThemeContextType = {
  isDarkMode: boolean;
  colors: ThemeColors;
  toggleTheme: () => void;
  language: MechanicLanguage;
  setLanguage: (language: MechanicLanguage) => void;
};

export type MechanicLanguage = 'en' | 'fil';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
const THEME_STORAGE_KEY = 'mechaniko_theme_mode';
const MECHANIC_THEME_STORAGE_KEY = 'mechaniko_mechanic_theme_mode';
const MECHANIC_LANGUAGE_STORAGE_KEY = 'mechaniko_mechanic_language';
const MOTORIST_LANGUAGE_STORAGE_KEY = 'mechaniko_motorist_language';

const mechanicLightTheme = {
  ...lightTheme,
  bg: mechanicPalette.bg,
  card: mechanicPalette.bgElevated,
  input: mechanicPalette.bgInput,
  softCard: mechanicPalette.amberSoft,
  text: mechanicPalette.text,
  textMuted: mechanicPalette.textMuted,
  border: mechanicPalette.border,
  primary: mechanicPalette.amber,
  btnSecondary: mechanicPalette.bgInput,
};

const mechanicDarkTheme = {
  ...darkTheme,
  bg: '#10151F',
  card: '#1A2230',
  input: '#242E3D',
  softCard: 'rgba(240, 162, 2, 0.16)',
  text: '#F3F4F6',
  textMuted: '#A8B1C0',
  border: '#303B4C',
  primary: mechanicPalette.amber,
  btnSecondary: '#242E3D',
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const userChangedTheme = useRef(false);
  const [language, setLanguageState] = useState<MechanicLanguage>('en');
  const userChangedLanguage = useRef(false);

  useEffect(() => {
    let active = true;
    const loadTheme = async () => {
      try {
        const storedTheme =
          Platform.OS === 'web'
            ? typeof window !== 'undefined'
              ? window.localStorage.getItem(THEME_STORAGE_KEY)
              : null
            : await SecureStore.getItemAsync(THEME_STORAGE_KEY);
        if (active && !userChangedTheme.current) {
          setIsDarkMode(storedTheme === 'dark');
        }
      } catch (error) {
        console.warn('Unable to load saved theme preference:', error);
      }
    };

    void loadTheme();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadLanguage = async () => {
      try {
        const storedLanguage =
          Platform.OS === 'web'
            ? typeof window !== 'undefined'
              ? window.localStorage.getItem(MOTORIST_LANGUAGE_STORAGE_KEY)
              : null
            : await SecureStore.getItemAsync(MOTORIST_LANGUAGE_STORAGE_KEY);
        if (
          active &&
          !userChangedLanguage.current &&
          (storedLanguage === 'en' || storedLanguage === 'fil')
        ) {
          setLanguageState(storedLanguage);
        }
      } catch (error) {
        console.warn('Unable to load saved motorist language:', error);
      }
    };

    void loadLanguage();
    return () => {
      active = false;
    };
  }, []);

  const toggleTheme = () => {
    userChangedTheme.current = true;
    const next = !isDarkMode;
    setIsDarkMode(next);
    void (async () => {
      try {
        if (Platform.OS === 'web') {
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(
              THEME_STORAGE_KEY,
              next ? 'dark' : 'light',
            );
          }
        } else {
          await SecureStore.setItemAsync(
            THEME_STORAGE_KEY,
            next ? 'dark' : 'light',
          );
        }
      } catch (error) {
        console.warn('Unable to save theme preference:', error);
      }
    })();
  };
  const setLanguage = (nextLanguage: MechanicLanguage) => {
    userChangedLanguage.current = true;
    setLanguageState(nextLanguage);
    void (async () => {
      try {
        if (Platform.OS === 'web') {
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(
              MOTORIST_LANGUAGE_STORAGE_KEY,
              nextLanguage,
            );
          }
        } else {
          await SecureStore.setItemAsync(
            MOTORIST_LANGUAGE_STORAGE_KEY,
            nextLanguage,
          );
        }
      } catch (error) {
        console.warn('Unable to save motorist language:', error);
      }
    })();
  };
  const colors = isDarkMode ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider
      value={{
        isDarkMode,
        colors,
        toggleTheme,
        language,
        setLanguage,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function MechanicThemeProvider({ children }: { children: ReactNode }) {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const userChangedTheme = useRef(false);
  const [language, setLanguageState] = useState<MechanicLanguage>('en');
  const userChangedLanguage = useRef(false);

  useEffect(() => {
    let active = true;
    const loadTheme = async () => {
      try {
        const storedTheme =
          Platform.OS === 'web'
            ? typeof window !== 'undefined'
              ? window.localStorage.getItem(MECHANIC_THEME_STORAGE_KEY)
              : null
            : await SecureStore.getItemAsync(MECHANIC_THEME_STORAGE_KEY);
        if (active && !userChangedTheme.current) {
          setIsDarkMode(storedTheme === 'dark');
        }
      } catch (error) {
        console.warn('Unable to load saved mechanic theme preference:', error);
      }
    };

    void loadTheme();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadLanguage = async () => {
      try {
        const storedLanguage =
          Platform.OS === 'web'
            ? typeof window !== 'undefined'
              ? window.localStorage.getItem(MECHANIC_LANGUAGE_STORAGE_KEY)
              : null
            : await SecureStore.getItemAsync(MECHANIC_LANGUAGE_STORAGE_KEY);
        if (
          active &&
          !userChangedLanguage.current &&
          (storedLanguage === 'en' || storedLanguage === 'fil')
        ) {
          setLanguageState(storedLanguage);
        }
      } catch (error) {
        console.warn('Unable to load saved mechanic language:', error);
      }
    };

    void loadLanguage();
    return () => {
      active = false;
    };
  }, []);

  const toggleTheme = () => {
    userChangedTheme.current = true;
    const next = !isDarkMode;
    setIsDarkMode(next);
    void (async () => {
      try {
        if (Platform.OS === 'web') {
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(
              MECHANIC_THEME_STORAGE_KEY,
              next ? 'dark' : 'light',
            );
          }
        } else {
          await SecureStore.setItemAsync(
            MECHANIC_THEME_STORAGE_KEY,
            next ? 'dark' : 'light',
          );
        }
      } catch (error) {
        console.warn('Unable to save mechanic theme preference:', error);
      }
    })();
  };

  const setLanguage = (nextLanguage: MechanicLanguage) => {
    userChangedLanguage.current = true;
    setLanguageState(nextLanguage);
    void (async () => {
      try {
        if (Platform.OS === 'web') {
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(
              MECHANIC_LANGUAGE_STORAGE_KEY,
              nextLanguage,
            );
          }
        } else {
          await SecureStore.setItemAsync(
            MECHANIC_LANGUAGE_STORAGE_KEY,
            nextLanguage,
          );
        }
      } catch (error) {
        console.warn('Unable to save mechanic language:', error);
      }
    })();
  };

  return (
    <ThemeContext.Provider
      value={{
        isDarkMode,
        colors: isDarkMode ? mechanicDarkTheme : mechanicLightTheme,
        toggleTheme,
        language,
        setLanguage,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useAppTheme must be used within a ThemeProvider");
  return context;
}