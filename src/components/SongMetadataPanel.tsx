import React, { useState } from 'react';
import { Image, Linking, Text, TouchableOpacity, View } from 'react-native';
import type { SongMetadata, SourceDetails } from '../songMetadata';
import { useTheme } from '../theme/ThemeContext';

export function providerLabel(provider: string): string {
  return ({ genius: 'Genius', lrclib: 'LRCLIB', lyricsovh: 'Lyrics.ovh', synclrc: 'SyncLRC', betterlyrics: 'Better Lyrics', youtubemusic: 'YouTube Music', songsterr: 'Songsterr', ultimateguitar: 'Ultimate Guitar' } as Record<string, string>)[provider] || provider;
}

function SourceLink({ url, label }: { url: string; label: string }) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  if (!/^https:\/\//i.test(url)) return null;
  return <View><TouchableOpacity accessibilityRole="link" accessibilityLabel={label} onPress={() => {
    setFailed(false); Linking.openURL(url).catch(() => setFailed(true));
  }} style={{ paddingVertical: 5 }}><Text style={{ color: colors.accent }}>{label} ↗</Text></TouchableOpacity>
    {failed && <Text style={{ color: colors.neutral500, fontSize: 12 }}>Could not open this link.</Text>}
  </View>;
}

export function MetadataValues({ metadata }: { metadata?: SongMetadata }) {
  const { colors } = useTheme();
  if (!metadata) return null;
  const duration = metadata.duration === undefined ? undefined : `${Math.floor(metadata.duration / 60)}:${Math.floor(metadata.duration % 60).toString().padStart(2, '0')}`;
  const values: [string, string | undefined][] = [
    ['Album', metadata.album], ['Key', metadata.key],
    ['Capo', metadata.capo === undefined ? undefined : metadata.capo === 0 ? 'No capo' : `Fret ${metadata.capo}`],
    ['Tuning', metadata.tuning?.join(' · ')], ['Tempo', metadata.tempo === undefined ? undefined : `${metadata.tempo} BPM`],
    ['Time signature', metadata.timeSignature], ['Duration', duration],
    ['Released', metadata.releaseDate ?? metadata.year?.toString()], ['Genre', metadata.genre],
    ['Language', metadata.language], ['Difficulty', metadata.difficulty], ['Recording', metadata.recording],
  ];
  return <View style={{ gap: 6 }}>
    {!!metadata.artworkUrl && <Image source={{ uri: metadata.artworkUrl }} accessibilityLabel="Album artwork" style={{ width: 100, height: 100, borderRadius: 8, marginBottom: 6 }} />}
    {values.filter(([, value]) => value !== undefined && value !== '').map(([label, value]) => <View key={label} style={{ flexDirection: 'row', gap: 10 }}>
      <Text style={{ color: colors.neutral500, width: 104 }}>{label}</Text>
      <Text selectable style={{ color: colors.text, flex: 1 }}>{value}</Text>
    </View>)}
    {metadata.credits?.map((credit, index) => <Text key={`${credit.role}-${credit.name}-${index}`} style={{ color: colors.neutral500 }}>{credit.role}: {credit.name}</Text>)}
    {metadata.mediaLinks?.map((link, index) => <SourceLink key={`${link.url}-${index}`} url={link.url} label={link.label || link.kind} />)}
  </View>;
}

export default function SongMetadataPanel({ metadata, sourceDetails }: { metadata?: SongMetadata; sourceDetails?: SourceDetails[] }) {
  const { colors, radius } = useTheme();
  const [expanded, setExpanded] = useState(false);
  if ((!metadata || !Object.values(metadata).some((value) => Array.isArray(value) ? value.length : value !== undefined && value !== '')) && !sourceDetails?.length) return null;
  return <View style={{ padding: 14, backgroundColor: colors.surface, borderRadius: radius.lg, gap: 12 }}>
    <Text style={{ color: colors.text, fontWeight: '600' }}>Song details</Text>
    <MetadataValues metadata={metadata} />
    {!!sourceDetails?.length && <>
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel="Details from each source" onPress={() => setExpanded(!expanded)} style={{ paddingVertical: 5 }}>
        <Text style={{ color: colors.accent }}>{expanded ? 'Hide' : 'Show'} details from each source ({sourceDetails.length})</Text>
      </TouchableOpacity>
      {expanded && sourceDetails.map((source, index) => <View key={`${source.provider}:${source.providerSongId}:${index}`} style={{ gap: 8, paddingTop: 10, borderTopColor: colors.divider, borderTopWidth: 1 }}>
        <Text style={{ color: colors.text, fontWeight: '600' }}>{providerLabel(source.provider)}</Text>
        <MetadataValues metadata={source.metadata} />
        {!!source.sourceUrl && <SourceLink url={source.sourceUrl} label={`Open ${providerLabel(source.provider)} source`} />}
      </View>)}
    </>}
  </View>;
}
