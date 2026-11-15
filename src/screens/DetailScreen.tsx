import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, ScrollView, Pressable, StyleSheet, BackHandler, Animated, StatusBar, GestureResponderEvent } from 'react-native';
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
import { BackChevronIcon, MoreIcon, FullscreenIcon, ExitFullscreenIcon } from '../components/Icons';

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

  // Full screen: only the lyrics. The Back key leaves it before it leaves the song.
  const [full, setFull] = useState(false);

  // The Back key closes the menu, then full screen, instead of leaving the song.
  useEffect(() => {
    if (!menuOpen && !full) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (menuOpen) setMenuOpen(false);
      else setFull(false);
      return true;
    });
    return () => sub.remove();
  }, [menuOpen, full]);

  // Double tap on the lyrics moves by a page: the top third goes back, the rest goes forward.
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const viewH = useRef(0);
  const areaRef = useRef<View>(null);
  // The position bar: its height and travel come from how much of the song fits on screen.
  const contentH = useRef(0);
  const scrollAnim = useRef(new Animated.Value(0)).current;
  const ratio = useRef(new Animated.Value(1)).current;
  const [thumbH, setThumbH] = useState(0);
  const [scrollable, setScrollable] = useState(false);
  const syncThumb = () => {
    const v = viewH.current;
    const c = contentH.current;
    if (v <= 0 || c <= v + 1) {
      setScrollable(false);
      return;
    }
    ratio.setValue(v / c);
    setThumbH(Math.max(24, (v * v) / c));
    setScrollable(true);
  };
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
      <StatusBar hidden={full} />
      {!full && (
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
        <TouchableOpacity onPress={() => setFull(true)} accessibilityLabel="Full screen" style={styles.iconBtn}>
          <FullscreenIcon color={colors.accent} size={ICON.button} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setMenuOpen((o) => !o)} style={styles.iconBtn}>
          <MoreIcon color={colors.accent} size={ICON.button} />
        </TouchableOpacity>
      </View>
      )}

      <View
        ref={areaRef}
        style={{ flex: 1 }}
        onLayout={(e) => {
          viewH.current = e.nativeEvent.layout.height;
          syncThumb();
        }}
      >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: full ? LAYOUT.top + LAYOUT.iconButton + 4 : 0, paddingBottom: 80, flexGrow: 1 }}
        onScroll={(e) => {
          scrollY.current = e.nativeEvent.contentOffset.y;
          scrollAnim.setValue(scrollY.current);
        }}
        onContentSizeChange={(_w, h) => {
          contentH.current = h;
          syncThumb();
        }}
        scrollEventThrottle={16}
      >
        {/* The controls are the first thing in the scroll: they are there when you open the song, and they
            move out of the way while you read. */}
        {!full && (
        <View style={styles.toolbar}>
          <View style={[styles.sizeGroup, { borderColor: colors.divider }]}>
            <TouchableOpacity
              onPress={() => setFontSize((f) => Math.max(16, f - 2))}
              accessibilityLabel="Smaller text"
              style={styles.sizeBtn}
            >
              <Text style={{ color: colors.accent, fontSize: TYPE.small, fontWeight: '600' }}>A</Text>
            </TouchableOpacity>
            <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: colors.divider }} />
            <TouchableOpacity
              onPress={() => setFontSize((f) => Math.min(36, f + 2))}
              accessibilityLabel="Larger text"
              style={styles.sizeBtn}
            >
              <Text style={{ color: colors.accent, fontSize: TYPE.title, fontWeight: '600' }}>A</Text>
            </TouchableOpacity>
          </View>
          {hasChords && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: TYPE.label, color: colors.text }}>Chords</Text>
              <Switch value={chordsOn} onChange={setChordsOn} />
            </View>
          )}
        </View>
        )}

        <Pressable onPress={onLyricsTap} style={{ flexGrow: 1 }}>
          {song.lines.map((line, i) => (
            // A chord sits right on the line it belongs to; the space between lines separates the lines.
            <View key={i} style={{ marginBottom: 8 }}>
              {chordsOn && !!line.chord && (
                // More air above a chord line than below it, so it reads as belonging to the words under it.
                <Text
                  style={{
                    fontSize,
                    color: colors.accent,
                    fontFamily: 'monospace',
                    fontWeight: '700',
                    lineHeight: fontSize * 1.25,
                    letterSpacing: 0.3,
                    marginTop: 8,
                  }}
                >
                  {line.chord}
                </Text>
              )}
              {/* Light text on a dark page: a little more leading and tracking than the default. */}
              <Text style={{ fontSize, color: colors.text, lineHeight: fontSize * 1.55, letterSpacing: 0.15 }}>{line.text}</Text>
            </View>
          ))}
        </Pressable>
      </ScrollView>
      {/* Where you are in the song: a thin bar on the right edge, only when the song is longer than the screen. */}
      {scrollable && (
        <View pointerEvents="none" style={styles.thumbTrack}>
          <Animated.View
            style={{
              width: 3,
              borderRadius: 2,
              height: thumbH,
              backgroundColor: colors.neutral500,
              opacity: 0.6,
              transform: [{ translateY: Animated.multiply(scrollAnim, ratio) }],
            }}
          />
        </View>
      )}
      </View>

      {full && (
        <TouchableOpacity
          onPress={() => setFull(false)}
          accessibilityLabel="Leave full screen"
          style={[styles.exitFull, { backgroundColor: colors.surface, top: LAYOUT.top }]}
        >
          <ExitFullscreenIcon color={colors.accent} size={ICON.button} />
        </TouchableOpacity>
      )}

      {hasQueue && !full && (
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
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, paddingBottom: 18 },
  exitFull: {
    position: 'absolute',
    right: 12,
    width: LAYOUT.iconButton,
    height: LAYOUT.iconButton,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.85,
  },
  sizeGroup: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  sizeBtn: { width: 112, height: 44, alignItems: 'center', justifyContent: 'center' },
  thumbTrack: { position: 'absolute', right: 3, top: 0, bottom: 0, width: 3 },
  queueBtn: { flex: 1, height: 40, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
