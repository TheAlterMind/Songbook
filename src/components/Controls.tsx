// Sitness's controls, rebuilt for React Native. Sitness draws them with Ant Design Mobile
// (List mode="card", Switch, Picker/ActionSheet, Button "tonal"); the sizes here are the ones
// it ends up with: 17px rows, 15px headers and values, 13px descriptions, 16px corners.
import React from 'react';
import { Modal, Pressable, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { TYPE } from '../theme/tokens';
import { RightOutline } from './Icons';

/** A titled card of rows (adm List mode="card"). Rows after the first get a hairline above them. */
export function ListSection({ header, children }: { header?: string; children: React.ReactNode }) {
  const { colors, radius } = useTheme();
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View>
      {!!header && (
        <Text style={{ color: colors.neutral500, fontSize: TYPE.label, paddingVertical: 8 }}>{header}</Text>
      )}
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, overflow: 'hidden' }}>
        {rows.map((row, i) =>
          React.isValidElement(row) ? React.cloneElement(row as React.ReactElement<any>, { first: i === 0 }) : row
        )}
      </View>
    </View>
  );
}

type ItemProps = {
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Shown on the right: a value label (15px, dim) or a control such as a Switch. */
  extra?: React.ReactNode;
  onPress?: () => void;
  /** The chevron of a row that opens something; on by default when the row is pressable. */
  arrow?: boolean;
  /** Content below the title and description, such as swatches. */
  children?: React.ReactNode;
  first?: boolean;
};

/** One row of a ListSection (adm List.Item). */
export function ListItem({ title, description, extra, onPress, arrow, children, first }: ItemProps) {
  const { colors } = useTheme();
  const showArrow = arrow ?? !!onPress;
  const body = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.divider,
        paddingRight: 12,
      }}
    >
      <View style={{ flex: 1, paddingVertical: 12, minWidth: 0 }}>
        {title != null && <Text style={{ fontSize: TYPE.body, lineHeight: TYPE.body * 1.5, color: colors.text }}>{title}</Text>}
        {description != null && (
          <Text style={{ fontSize: TYPE.small, lineHeight: TYPE.small * 1.5, color: colors.neutral500 }}>{description}</Text>
        )}
        {children}
      </View>
      {extra != null && (
        <View style={{ paddingLeft: 12, maxWidth: '70%' }}>
          {typeof extra === 'string' || typeof extra === 'number' ? (
            <Text style={{ fontSize: TYPE.label, color: colors.neutral500 }}>{extra}</Text>
          ) : (
            extra
          )}
        </View>
      )}
      {showArrow && (
        <View style={{ marginLeft: 4 }}>
          <RightOutline color={colors.neutral500} size={19} />
        </View>
      )}
    </View>
  );
  const style: ViewStyle = { paddingLeft: 12 };
  return onPress ? (
    <TouchableOpacity onPress={onPress} style={style} activeOpacity={0.6}>
      {body}
    </TouchableOpacity>
  ) : (
    <View style={style}>{body}</View>
  );
}

/** adm Switch: 51 x 31 with a 2px outline; off is filled with the outline grey in dark mode, as in Sitness. */
export function Switch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const { colors, settings } = useTheme();
  const off = settings.lightMode ? colors.surface : colors.divider;
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={{
        width: 51,
        height: 31,
        borderRadius: 31,
        borderWidth: 2,
        borderColor: value ? colors.accent : colors.divider,
        backgroundColor: value ? colors.accent : off,
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: 27,
          height: 27,
          borderRadius: 14,
          backgroundColor: '#FFFFFF',
          alignSelf: value ? 'flex-end' : 'flex-start',
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 2,
          shadowOffset: { width: 0, height: 2 },
          elevation: 2,
        }}
      />
    </Pressable>
  );
}

export type Option<T> = { label: string; value: T; swatch?: string };

/** A bottom sheet to pick one option (Sitness's Picker / ActionSheet), phone-width on wide windows. */
export function OptionSheet<T>({
  visible,
  title,
  options,
  value,
  onPick,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: Option<T>[];
  value: T;
  onPick: (v: T) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            paddingBottom: 16,
            width: '100%',
            maxWidth: 560,
            alignSelf: 'center',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 12, paddingHorizontal: 8, paddingBottom: 4 }}>
            <TouchableOpacity onPress={onClose} style={{ paddingVertical: 8, paddingHorizontal: 12 }}>
              <Text style={{ fontSize: 16, color: colors.neutral500 }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={{ flex: 1, textAlign: 'center', fontSize: 16, color: colors.text }}>{title}</Text>
            <View style={{ width: 70 }} />
          </View>
          {options.map((o) => {
            const on = o.value === value;
            return (
              <TouchableOpacity
                key={String(o.value)}
                onPress={() => {
                  onPick(o.value);
                  onClose();
                }}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 44, gap: 10 }}
              >
                {!!o.swatch && <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: o.swatch }} />}
                <Text style={{ fontSize: on ? 20 : 18, color: on ? colors.text : colors.neutral500 }}>{o.label}</Text>
              </TouchableOpacity>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Sitness's "tonal" button: the well grey, no border, 16px corners, full width. */
export function TonalButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors, radius } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{ backgroundColor: colors.well, borderRadius: radius.md, paddingVertical: 11, alignItems: 'center' }}
    >
      <Text style={{ fontSize: TYPE.body, color: colors.text }}>{label}</Text>
    </TouchableOpacity>
  );
}
