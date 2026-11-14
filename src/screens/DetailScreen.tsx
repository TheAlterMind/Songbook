import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, ScrollView, Pressable, StyleSheet, BackHandler, GestureResponderEvent } from 'react-native';
import { Text } from '../components/Typography';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useTheme } from '../theme/ThemeContext';
import { TYPE, ICON, LAYOUT } from '../theme/tokens';
import { getSong, Song } from '../db/Database';
import { deleteWithUndo } from '../utils/undoDelete';
import { markOpened } from '../utils/lastOpened';
import { useToast } from '../components/Toast';
import { notify, errorText } from '../utils/notify';
import { Switch } from '../components/Controls';
import { BackChevronIcon, MoreIcon } from '../components/Icons';

export default function DetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { songId, queue } = route.params as { songId: number; queue?: number[] };
  const insets = useSafeAreaInsets();
  const { colors, radius, settings } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const { showUndo } = useToast();
  const [song, setSong] = useState<Song | null>(null);
  const [fontSize, setFontSize] = useState(settings.defaultFontSize);
  const [chordsOn, setChordsOn] = useState(settings.defaultChordsOn);

  useFocusEffect(
    useCallback(() => {
      getSong(songId).then((s) => setSong(s));
      markOpened(songId);
    }, [songId])
  );

  // Keep the screen on while this song is on screen, if asked to.
  useFocusEffect(
    useCallback(() => {
      if (!settings.keepAwake) return;
      activateKeepAwakeAsync('song').catch(() => {});
      return () => {
        deactivateKeepAwake('song').catch(() => {});
      };
    }, [settings.keepAwake])
  );

  // The Back key closes the menu instead of leaving the song.
  useEffect(() => {
    if (!menuOpen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setMenuOpen(false);
      return true;
    });
    return () => sub.remove();
  }, [menuOpen]);

  // Double tap on the lyrics moves by a page: the top third goes back, the rest goes forward.
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const viewH = useRef(0);
  const areaRef = useRef<View>(null);
  const lastTap = useRef(0);
  const onLyricsTap = (e: GestureResponderEvent) => {
    const now = Date.now();
    if (now - lastTap.current > 320) {
      lastTap.current = now;
      return;
    }
    lastTap.current = 0;
    // locationY is relative to whichever line was touched, so compare the screen position instead.
    const pageY = e.nativeEvent.pageY;
    const scrollTo = (back: boolean) => {
      const page = Math.max(100, viewH.current - 48); // a little overlap so no line is lost
      scrollRef.current?.scrollTo({ y: Math.max(0, scrollY.current + (back ? -page : page)), animated: true });
    };
    if (!areaRef.current) return scrollTo(false);
    areaRef.current.measureInWindow((_x, top, _w, height) => scrollTo(pageY < top + height / 2));
  };

  if (!song) return null;

  const hasChords = song.lines.some((l) => !!l.chord);

  // Opened from a collection: Previous and Next walk through it in order. Replacing the screen keeps Back
  // returning to the collection instead of piling up one screen per song.
  const place = queue ? queue.indexOf(songId) : -1;
  const hasQueue = !!queue && queue.length > 1 && place >= 0;
  const go = (by: -1 | 1) => {
    if (!queue) return;
    const next = queue[place + by];
    if (next != null) navigation.replace('Detail', { songId: next, queue });
  };

  const onDelete = () => {
    setMenuOpen(false);
    deleteWithUndo(song, showUndo)
      .then(() => navigation.goBack())
      .catch((e) => notify('Could not delete', errorText(e)));
  };

  const items = [
    { label: 'Edit', run: () => navigation.navigate('Edit', { songId }) },
    { label: 'Add to collection', run: () => navigation.navigate('AddToCollection', { songId }) },
    { label: 'Change cover', run: () => navigation.navigate('CoverPicker', { songId }) },
    { label: 'Delete', danger: true, run: onDelete },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.iconBtn}
        >
          <BackChevronIcon color={colors.text} size={ICON.button} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ flex: 1, minWidth: 0, paddingVertical: 6 }}>
          <Text style={{ fontSize: TYPE.title, fontWeight: '500', color: colors.text }} numberOfLines={1}>
            {song.title}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setMenuOpen((o) => !o)} style={styles.iconBtn}>
          <MoreIcon color={colors.accent} size={ICON.button} />
        </TouchableOpacity>
      </View>

      <View style={styles.toolbar}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity
            onPress={() => setFontSize((f) => Math.max(16, f - 1))}
            hitSlop={{ top: 8, bottom: 8 }}
            style={[styles.smallBtn, { flex: 1, borderColor: colors.divider }]}
          >
            <Text style={{ color: colors.accent, fontSize: TYPE.small }}>A−</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setFontSize((f) => Math.min(30, f + 1))}
            hitSlop={{ top: 8, bottom: 8 }}
            style={[styles.smallBtn, { flex: 1, borderColor: colors.divider }]}
          >
            <Text style={{ color: colors.accent, fontSize: TYPE.body }}>A+</Text>
          </TouchableOpacity>
          {hasChords && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 6 }}>
              <Text style={{ fontSize: TYPE.label, color: colors.text }}>Chords</Text>
              <Switch value={chordsOn} onChange={setChordsOn} />
            </View>
          )}
        </View>
      </View>

      <View ref={areaRef} style={{ flex: 1 }} onLayout={(e) => (viewH.current = e.nativeEvent.layout.height)}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: 20, paddingBottom: 60, flexGrow: 1 }}
        onScroll={(e) => (scrollY.current = e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
      >
        <Pressable onPress={onLyricsTap} style={{ flexGrow: 1 }}>
          {song.lines.map((line, i) => (
            <View key={i} style={{ marginBottom: 9 }}>
              {chordsOn && !!line.chord && (
                <Text style={{ fontSize, color: colors.accent, fontFamily: 'monospace', lineHeight: fontSize * 1.2 }}>{line.chord}</Text>
              )}
              <Text style={{ fontSize, color: colors.text, lineHeight: fontSize * 1.5 }}>{line.text}</Text>
            </View>
          ))}
        </Pressable>
      </ScrollView>
      </View>

      {hasQueue && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: 20,
            paddingTop: 10,
            paddingBottom: Math.max(insets.bottom, 10),
            borderTopWidth: 1,
            borderTopColor: colors.divider,
            backgroundColor: colors.bg,
          }}
        >
          <TouchableOpacity
            onPress={() => go(-1)}
            disabled={place === 0}
            style={[styles.queueBtn, { borderColor: colors.divider, opacity: place === 0 ? 0.3 : 1 }]}
          >
            <Text style={{ color: colors.accent, fontSize: TYPE.body }}>Previous</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: TYPE.small, color: colors.neutral500, minWidth: 54, textAlign: 'center' }}>
            {place + 1} / {queue!.length}
          </Text>
          <TouchableOpacity
            onPress={() => go(1)}
            disabled={place === queue!.length - 1}
            style={[styles.queueBtn, { borderColor: colors.divider, opacity: place === queue!.length - 1 ? 0.3 : 1 }]}
          >
            <Text style={{ color: colors.accent, fontSize: TYPE.body }}>Next</Text>
          </TouchableOpacity>
        </View>
      )}

      {menuOpen && (
        <>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuOpen(false)} />
          <View style={[styles.menu, { backgroundColor: colors.surface, borderColor: colors.divider, borderRadius: radius.md }]}>
            {items.map((it) => (
              <TouchableOpacity
                key={it.label}
                onPress={() => {
                  setMenuOpen(false);
                  it.run();
                }}
                style={styles.menuItem}
              >
                <Text style={{ fontSize: TYPE.body, color: it.danger ? '#ff4d4f' : colors.text }}>{it.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Sitness .page-head: icon buttons sit edge to edge, their own padding gives the side margin.
  header: { paddingTop: LAYOUT.top, paddingHorizontal: 6, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 0 },
  iconBtn: { width: LAYOUT.iconButton, height: LAYOUT.iconButton, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  menu: {
    position: 'absolute',
    top: LAYOUT.top + LAYOUT.iconButton - 2,
    right: 10,
    borderWidth: 1,
    paddingVertical: 6,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  menuItem: { height: 44, paddingHorizontal: 16, justifyContent: 'center' },
  toolbar: { paddingHorizontal: 20, marginTop: 4 },
  queueBtn: { flex: 1, height: 40, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  smallBtn: { width: 48, height: 36, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
