import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Typography';
import { useTheme } from '../theme/ThemeContext';
import { TYPE, LAYOUT } from '../theme/tokens';

type ToastState = { id: number; message: string; onUndo?: () => void };
type ToastApi = {
  showUndo: (message: string, onUndo: () => void) => void;
  /** A short note with no button, such as "Synced". */
  showMessage: (message: string) => void;
};

const ToastContext = createContext<ToastApi>({ showUndo: () => {}, showMessage: () => {} });
export const useToast = () => useContext(ToastContext);

const UNDO_VISIBLE_MS = 6000;
const MESSAGE_VISIBLE_MS = 3000;

/** A snackbar shown above the bottom menu, with an Undo button when there is something to undo. One message at a time. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastState | null>(null);
  const counter = useRef(0);

  const showUndo = useCallback((message: string, onUndo: () => void) => {
    counter.current += 1;
    setToast({ id: counter.current, message, onUndo });
  }, []);

  const showMessage = useCallback((message: string) => {
    counter.current += 1;
    setToast({ id: counter.current, message });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.onUndo ? UNDO_VISIBLE_MS : MESSAGE_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext.Provider value={{ showUndo, showMessage }}>
      {children}
      {toast && (
        // Clear of the bottom menu and the + button that rises above it.
        <View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + LAYOUT.tabBar + LAYOUT.tabProtrude + 12 }]}>
          <View style={[styles.bar, { backgroundColor: colors.surface, borderColor: colors.divider, borderRadius: radius.md }]}>
            <Text numberOfLines={1} style={{ flex: 1, fontSize: TYPE.label, color: colors.text }}>
              {toast.message}
            </Text>
            {toast.onUndo && (
              <TouchableOpacity
                onPress={() => {
                  const undo = toast.onUndo;
                  setToast(null);
                  undo?.();
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={{ fontSize: TYPE.label, fontWeight: '500', color: colors.accent }}>Undo</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, paddingHorizontal: 18 },
  bar: {
    minHeight: LAYOUT.iconButton,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
});
