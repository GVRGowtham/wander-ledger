import React, { useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { DestinationBanner } from '../components/banners/DestinationBanner';
import { BoardingPassCard } from '../components/cards/BoardingPassCard';
import { MemoryIllustration } from '../components/cards/MemoryIllustration';
import { useApp } from '../context/AppContext';
import { generateId } from '../db/database';
import { convertCurrency } from '../services/fxService';
import { pickAndOptimizeMemoryPhoto } from '../services/mediaService';
import {
  CATEGORY_META,
  COLORS,
  formatMoney,
  MOOD_STICKERS,
  SHADOWS,
} from '../theme/tokens';
import { ExpenseCategory } from '../types/models';

interface Props {
  tripId: string;
  onBack: () => void;
  onOpenScanner: () => void;
}

type InnerTab = 'memories' | 'bookings' | 'spend';

export const TripDetailScreen: React.FC<Props> = ({
  tripId,
  onBack,
  onOpenScanner,
}) => {
  const {
    trips,
    profile,
    fxRates,
    getFlightsForTrip,
    getStaysForTrip,
    getExpensesForTrip,
    getMemoriesForTrip,
    getSummaryForTrip,
    addMemory,
    addExpense,
    setTripCoverPhoto,
    saveTripSharing,
  } = useApp();

  const trip = trips.find((t) => t.id === tripId);
  const [tab, setTab] = useState<InnerTab>('memories');
  const [expandedReceiptId, setExpandedReceiptId] = useState<string | null>(null);

  // Add Memory Modal
  const [memoryModal, setMemoryModal] = useState(false);
  const [memTitle, setMemTitle] = useState('');
  const [memNote, setMemNote] = useState('');
  const [memPlace, setMemPlace] = useState('');
  const [memMood, setMemMood] = useState(MOOD_STICKERS[0]);
  const [memPhotoUri, setMemPhotoUri] = useState<string | undefined>(undefined);
  const [memThumbUri, setMemThumbUri] = useState<string | undefined>(undefined);

  // Quick Expense Modal
  const [expenseModal, setExpenseModal] = useState(false);
  const [expMerchant, setExpMerchant] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expCurrency, setExpCurrency] = useState('USD');
  const [expCategory, setExpCategory] = useState<ExpenseCategory>('dining');

  // Share Modal
  const [shareModal, setShareModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');

  if (!trip) {
    return (
      <View style={styles.missingWrap}>
        <Text style={styles.missingText}>Trip not found.</Text>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back to Trips</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const flights = getFlightsForTrip(trip.id);
  const stays = getStaysForTrip(trip.id);
  const expenses = getExpensesForTrip(trip.id);
  const memories = getMemoriesForTrip(trip.id);
  const summary = getSummaryForTrip(trip.id);

  // Spend breakdown by category
  const catTotals: Record<string, number> = {};
  for (const e of expenses) {
    catTotals[e.category] = (catTotals[e.category] ?? 0) + e.homeAmount;
  }
  for (const s of stays) {
    catTotals.lodging = (catTotals.lodging ?? 0) + s.homeCost;
  }
  const grandTotal = Math.max(1, summary.totalSpentHome);

  const handlePickMemoryPhoto = async (source: 'camera' | 'library') => {
    const res = await pickAndOptimizeMemoryPhoto(trip.id, source);
    if (res) {
      setMemPhotoUri(res.photoUri);
      setMemThumbUri(res.thumbUri);
      Haptics.selectionAsync().catch(() => {});
    }
  };

  const handleSaveMemory = () => {
    if (!memTitle.trim() && !memNote.trim()) {
      Alert.alert('Add a quick note', 'Give your memory a title or short reflection!');
      return;
    }
    addMemory({
      id: generateId('mem'),
      tripId: trip.id,
      title: memTitle.trim() || `${trip.destinationCity} Moment`,
      note: memNote.trim() || 'A favorite moment from the journey ✨',
      capturedAt: new Date().toISOString().slice(0, 19),
      placeName: memPlace.trim() || `${trip.destinationCity}, ${trip.destinationCountry}`,
      photoUri: memPhotoUri,
      thumbUri: memThumbUri,
      illustrationKey: memPhotoUri ? undefined : 'torii',
      moodSticker: memMood,
      isHighlight: false,
      authorName: profile?.displayName.split(' ')[0] || 'You',
      createdAt: new Date().toISOString(),
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setMemTitle('');
    setMemNote('');
    setMemPlace('');
    setMemPhotoUri(undefined);
    setMemThumbUri(undefined);
    setMemoryModal(false);
  };

  const handleSaveExpense = () => {
    const amt = parseFloat(expAmount);
    if (!expMerchant.trim() || Number.isNaN(amt) || amt <= 0) {
      Alert.alert('Check expense', 'Enter a merchant name and valid amount.');
      return;
    }
    const { converted, rate } = convertCurrency(amt, expCurrency, trip.homeCurrency, fxRates);
    addExpense({
      id: generateId('exp'),
      tripId: trip.id,
      merchant: expMerchant.trim(),
      category: expCategory,
      localAmount: amt,
      localCurrency: expCurrency.toUpperCase(),
      homeAmount: converted,
      homeCurrency: trip.homeCurrency,
      fxRateUsed: rate,
      expenseDate: new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setExpMerchant('');
    setExpAmount('');
    setExpenseModal(false);
  };

  const handleInviteBuddy = () => {
    const buddy = inviteEmail.trim();
    if (!buddy) return;
    const token = trip.shareToken || `wl_${trip.id.slice(-8)}`;
    const nextList = Array.from(new Set([...trip.coTravelers, buddy]));
    saveTripSharing(trip.id, true, nextList, token);
    setInviteEmail('');
    Alert.alert(
      'Co-Traveler Added 💌',
      `${buddy} has been added to "${trip.title}". Share the invite link so they can join via Google Sign-In!`
    );
  };

  const handleSharePostcard = async () => {
    const token = trip.shareToken || `wl_${trip.id.slice(-8)}`;
    if (!trip.isShared) {
      saveTripSharing(trip.id, true, trip.coTravelers, token);
    }
    const highlights = memories
      .slice(0, 3)
      .map((m) => `• ${m.moodSticker} ${m.title}`)
      .join('\n');

    await Share.share({
      title: `${trip.title} ${trip.flagEmoji} — WanderLedger Postcard`,
      message: `📮 Greetings from ${trip.title} ${trip.flagEmoji}!\n${trip.startDate} → ${trip.endDate}\n✈️ ${summary.totalMilesFlown.toLocaleString()} miles flown • 📸 ${summary.memoriesCount} memories\n\nHighlights:\n${highlights || '• Exploring and making memories!'}\n\n(Private spend & receipts stay hidden on shared postcards ✨)`,
    });
  };

  return (
    <View style={styles.root}>
      {/* Top Scenic Postcard Header */}
      <View style={styles.topHeader}>
        <DestinationBanner vibe={trip.vibe} coverPhotoUri={trip.coverPhotoUri} height={152} />
        <LinearGradient
          colors={['rgba(0,0,0,0.45)', 'transparent', 'rgba(0,0,0,0.62)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.headerNavRow}>
          <TouchableOpacity onPress={onBack} style={styles.glassBtn}>
            <Text style={styles.glassBtnText}>← Trips</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={onOpenScanner} style={styles.glassBtn}>
              <Text style={styles.glassBtnText}>📷 Scan</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShareModal(true)} style={styles.shareGlassBtn}>
              <Text style={styles.shareGlassText}>💌 Share</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.headerBottomText}>
          <Text style={styles.tripTitle}>
            {trip.title} {trip.flagEmoji}
          </Text>
          <Text style={styles.tripDates}>
            {trip.startDate} → {trip.endDate} • {formatMoney(summary.totalSpentHome, trip.homeCurrency)} spent •{' '}
            {summary.totalMilesFlown.toLocaleString()} mi
          </Text>
        </View>
      </View>

      {/* 3 Focused Tabs: 📸 Memories | ✈️ Bookings | 🧾 Spend */}
      <View style={styles.tabsWrap}>
        <TabPill
          active={tab === 'memories'}
          label={`📸 Memories (${memories.length})`}
          onPress={() => setTab('memories')}
        />
        <TabPill
          active={tab === 'bookings'}
          label={`✈️ Bookings (${flights.length + stays.length})`}
          onPress={() => setTab('bookings')}
        />
        <TabPill
          active={tab === 'spend'}
          label={`🧾 Spend (${expenses.length})`}
          onPress={() => setTab('spend')}
        />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* TAB 1: CLEAN POLAROID MEMORIES TIMELINE (ZERO RECEIPT CLUTTER) */}
        {tab === 'memories' && (
          <View style={styles.sectionGap}>
            <View style={styles.rowBetween}>
              <View>
                <Text style={styles.subHeading}>✨ Polaroid Travelogue</Text>
                <Text style={styles.tinyNote}>Photos & notes only — receipts stay tucked in Spend</Text>
              </View>
              <TouchableOpacity
                onPress={() => setMemoryModal(true)}
                style={styles.actionPill}
              >
                <Text style={styles.actionPillText}>+ Add Memory</Text>
              </TouchableOpacity>
            </View>

            {memories.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={{ fontSize: 32 }}>📸</Text>
                <Text style={styles.emptyTitle}>No memories captured yet!</Text>
                <Text style={styles.emptySub}>
                  Snap a Polaroid photo and write a quick note to start your travelogue.
                </Text>
                <TouchableOpacity
                  onPress={() => setMemoryModal(true)}
                  style={styles.emptyBtn}
                >
                  <Text style={styles.emptyBtnText}>📸 Capture First Memory</Text>
                </TouchableOpacity>
              </View>
            ) : (
              memories.map((m, idx) => (
                <View
                  key={m.id}
                  style={[
                    styles.polaroidCard,
                    { transform: [{ rotate: idx % 2 === 0 ? '-0.8deg' : '0.8deg' }] },
                  ]}
                >
                  <View style={styles.tapeStrip} />
                  <MemoryIllustration
                    photoUri={m.photoUri}
                    illustrationKey={m.illustrationKey}
                    height={165}
                  />
                  <View style={styles.polaroidBody}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.polaroidTitle}>{m.title}</Text>
                      <Text style={styles.polaroidDate}>{m.capturedAt.slice(0, 10)}</Text>
                    </View>
                    <Text style={styles.polaroidNote}>{m.note}</Text>
                    <View style={styles.polaroidFooter}>
                      <View style={styles.moodTag}>
                        <Text style={styles.moodTagText}>{m.moodSticker}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        {m.authorName ? (
                          <Text style={styles.authorTag}>by {m.authorName}</Text>
                        ) : null}
                        {m.photoUri && (
                          <TouchableOpacity
                            onPress={() => {
                              setTripCoverPhoto(trip.id, m.photoUri!);
                              Alert.alert('Trip Cover Updated ⭐', 'Your postcard banner now shows this memory!');
                            }}
                          >
                            <Text style={styles.coverAction}>⭐ Set Cover</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* TAB 2: PERFORATED FLIGHTS & COZY STAYS */}
        {tab === 'bookings' && (
          <View style={styles.sectionGap}>
            <View style={styles.rowBetween}>
              <Text style={styles.subHeading}>✈️ Flights & Boarding Passes</Text>
              <TouchableOpacity onPress={onOpenScanner} style={styles.actionPill}>
                <Text style={styles.actionPillText}>📷 Scan Pass</Text>
              </TouchableOpacity>
            </View>

            {flights.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={{ fontSize: 28 }}>✈️</Text>
                <Text style={styles.emptyTitle}>No flights logged yet</Text>
                <Text style={styles.emptySub}>
                  Point your camera at any paper or mobile boarding pass barcode to auto-add!
                </Text>
              </View>
            ) : (
              flights.map((f) => <BoardingPassCard key={f.id} flight={f} />)
            )}

            <View style={[styles.rowBetween, { marginTop: 8 }]}>
              <Text style={styles.subHeading}>🏨 Hotels & Stays</Text>
              <TouchableOpacity onPress={onOpenScanner} style={styles.actionPill}>
                <Text style={styles.actionPillText}>📷 Scan Hotel</Text>
              </TouchableOpacity>
            </View>

            {stays.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={{ fontSize: 28 }}>🏨</Text>
                <Text style={styles.emptyTitle}>No stays logged yet</Text>
                <Text style={styles.emptySub}>
                  Scan a hotel confirmation page to log dates, confirmation code & address offline.
                </Text>
              </View>
            ) : (
              stays.map((s) => {
                const cpp =
                  s.pointsRedeemed > 0 && s.cashValueEstimate
                    ? (((s.cashValueEstimate - s.costCash) / s.pointsRedeemed) * 100).toFixed(2)
                    : null;
                return (
                  <View key={s.id} style={styles.stayCard}>
                    <View style={styles.rowBetween}>
                      <View style={styles.stayBadge}>
                        <Text style={styles.stayBadgeText}>🏨 {s.nights} NIGHTS</Text>
                      </View>
                      {s.confirmationCode ? (
                        <Text style={styles.confCode}>#{s.confirmationCode}</Text>
                      ) : null}
                    </View>
                    <Text style={styles.stayName}>{s.name}</Text>
                    <Text style={styles.stayDates}>
                      Check-in {s.checkIn} → Check-out {s.checkOut}
                    </Text>
                    {s.address ? (
                      <Text style={styles.stayAddr}>📍 {s.address} (Saved offline)</Text>
                    ) : null}
                    <View style={styles.stayCostBox}>
                      <Text style={styles.stayCostText}>
                        {s.pointsRedeemed > 0
                          ? `${(s.pointsRedeemed / 1000).toFixed(0)}k pts + ${formatMoney(s.costCash, s.currency)}`
                          : formatMoney(s.costCash, s.currency)}
                      </Text>
                      {cpp && <Text style={styles.cppText}>{cpp}¢/pt value 🔥</Text>}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* TAB 3: SPEND LEDGER WITH TUCKED-AWAY PRIVATE RECEIPTS */}
        {tab === 'spend' && (
          <View style={styles.sectionGap}>
            <View style={styles.spendSummaryCard}>
              <View style={styles.rowBetween}>
                <Text style={styles.subHeading}>💰 Spend Overview</Text>
                <Text style={styles.spendTotal}>
                  {formatMoney(summary.totalSpentHome, trip.homeCurrency)}
                  {trip.budget > 0 ? ` / ${formatMoney(trip.budget, trip.homeCurrency)}` : ''}
                </Text>
              </View>

              {/* Category Proportional Bar */}
              <View style={styles.catBar}>
                {Object.entries(catTotals).map(([cat, amt]) => {
                  const meta = CATEGORY_META[cat as ExpenseCategory] ?? CATEGORY_META.other;
                  const pct = Math.max(6, Math.round((amt / grandTotal) * 100));
                  return (
                    <View
                      key={cat}
                      style={{ width: `${pct}%`, backgroundColor: meta.color, height: '100%' }}
                    />
                  );
                })}
              </View>

              <View style={styles.catLegend}>
                {Object.entries(catTotals).map(([cat, amt]) => {
                  const meta = CATEGORY_META[cat as ExpenseCategory] ?? CATEGORY_META.other;
                  return (
                    <View key={cat} style={styles.legendChip}>
                      <View style={[styles.legendDot, { backgroundColor: meta.color }]} />
                      <Text style={styles.legendText}>
                        {meta.label}: {formatMoney(amt, trip.homeCurrency)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>

            <View style={styles.rowBetween}>
              <Text style={styles.subHeading}>🧾 Bills & Tucked-Away Receipts</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  onPress={() => setExpenseModal(true)}
                  style={styles.actionPillSoft}
                >
                  <Text style={styles.actionPillSoftText}>+ Manual</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onOpenScanner} style={styles.actionPill}>
                  <Text style={styles.actionPillText}>📷 Scan Bill</Text>
                </TouchableOpacity>
              </View>
            </View>

            {expenses.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={{ fontSize: 28 }}>🧾</Text>
                <Text style={styles.emptyTitle}>No expenses logged yet</Text>
                <Text style={styles.emptySub}>
                  Scan restaurant bills in any currency — we convert them offline and keep receipts tucked neatly here!
                </Text>
              </View>
            ) : (
              expenses.map((e) => {
                const meta = CATEGORY_META[e.category] ?? CATEGORY_META.other;
                const hasReceipt = Boolean(e.receiptUri || e.receiptRawText);
                const isOpen = expandedReceiptId === e.id;
                return (
                  <TouchableOpacity
                    key={e.id}
                    onPress={() =>
                      hasReceipt && setExpandedReceiptId(isOpen ? null : e.id)
                    }
                    activeOpacity={hasReceipt ? 0.8 : 1}
                    style={styles.expenseCard}
                  >
                    <View style={styles.rowBetween}>
                      <View style={styles.expLeft}>
                        <View style={[styles.expIconBox, { backgroundColor: meta.bg }]}>
                          <Text style={{ fontSize: 16 }}>{meta.emoji}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.expMerchant} numberOfLines={1}>
                            {e.merchant}
                          </Text>
                          <Text style={styles.expSub}>
                            {e.expenseDate} • {formatMoney(e.localAmount, e.localCurrency)}
                            {hasReceipt ? ' • 🧾 Receipt saved' : ''}
                          </Text>
                        </View>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.expHome}>
                          {formatMoney(e.homeAmount, e.homeCurrency)}
                        </Text>
                        {hasReceipt && (
                          <Text style={styles.peekLink}>
                            {isOpen ? 'Hide ▲' : 'Peek 🧾'}
                          </Text>
                        )}
                      </View>
                    </View>

                    {isOpen && (
                      <View style={styles.receiptDrawer}>
                        <Text style={styles.receiptPrivateBadge}>
                          🔒 Private Receipt (Hidden from shared Postcards)
                        </Text>
                        {e.receiptUri && (
                          <Image
                            source={{ uri: e.receiptUri }}
                            style={styles.receiptImg}
                            resizeMode="contain"
                          />
                        )}
                        {e.receiptRawText && (
                          <Text style={styles.receiptMono}>{e.receiptRawText}</Text>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}
      </ScrollView>

      {/* ADD MEMORY MODAL */}
      <Modal visible={memoryModal} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.rowBetween}>
              <Text style={styles.modalTitle}>📸 Capture a Polaroid Memory</Text>
              <TouchableOpacity onPress={() => setMemoryModal(false)}>
                <Text style={styles.closeX}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={() => handlePickMemoryPhoto('camera')}
                style={styles.photoPickBtn}
              >
                <Text style={styles.photoPickText}>📷 Take Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handlePickMemoryPhoto('library')}
                style={styles.photoPickBtn}
              >
                <Text style={styles.photoPickText}>🖼️ From Gallery</Text>
              </TouchableOpacity>
            </View>

            {memPhotoUri && (
              <Image
                source={{ uri: memPhotoUri }}
                style={styles.previewMemImg}
                resizeMode="cover"
              />
            )}

            <TextInput
              value={memTitle}
              onChangeText={setMemTitle}
              placeholder="Moment title (e.g. Sunset at Arashiyama)"
              placeholderTextColor={COLORS.inkSoft}
              style={styles.input}
            />
            <TextInput
              value={memPlace}
              onChangeText={setMemPlace}
              placeholder="Place name (optional)"
              placeholderTextColor={COLORS.inkSoft}
              style={styles.input}
            />
            <TextInput
              value={memNote}
              onChangeText={setMemNote}
              placeholder="How did it feel? Write your little story..."
              placeholderTextColor={COLORS.inkSoft}
              multiline
              numberOfLines={3}
              style={[styles.input, { height: 74, textAlignVertical: 'top' }]}
            />

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 6 }}
            >
              {MOOD_STICKERS.map((s) => (
                <TouchableOpacity
                  key={s}
                  onPress={() => setMemMood(s)}
                  style={[styles.moodChip, memMood === s && styles.moodChipActive]}
                >
                  <Text
                    style={[
                      styles.moodChipText,
                      memMood === s && { color: '#FFFFFF' },
                    ]}
                  >
                    {s}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity onPress={handleSaveMemory} style={styles.modalPrimaryBtn}>
              <Text style={styles.modalPrimaryText}>Save to Polaroid Timeline ✨</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* QUICK MANUAL EXPENSE MODAL */}
      <Modal visible={expenseModal} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.rowBetween}>
              <Text style={styles.modalTitle}>🧾 Add Quick Expense</Text>
              <TouchableOpacity onPress={() => setExpenseModal(false)}>
                <Text style={styles.closeX}>✕</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              value={expMerchant}
              onChangeText={setExpMerchant}
              placeholder="Merchant (e.g. Ichiran Ramen)"
              placeholderTextColor={COLORS.inkSoft}
              style={styles.input}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TextInput
                value={expAmount}
                onChangeText={setExpAmount}
                placeholder="Amount"
                placeholderTextColor={COLORS.inkSoft}
                keyboardType="decimal-pad"
                style={[styles.input, { flex: 1 }]}
              />
              <TextInput
                value={expCurrency}
                onChangeText={setExpCurrency}
                placeholder="USD"
                autoCapitalize="characters"
                maxLength={3}
                style={[styles.input, { width: 84, textAlign: 'center' }]}
              />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {(Object.keys(CATEGORY_META) as ExpenseCategory[]).map((cat) => {
                const m = CATEGORY_META[cat];
                const active = expCategory === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => setExpCategory(cat)}
                    style={[styles.moodChip, active && styles.moodChipActive]}
                  >
                    <Text style={[styles.moodChipText, active && { color: '#FFFFFF' }]}>
                      {m.emoji} {m.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity onPress={handleSaveExpense} style={styles.modalPrimaryBtn}>
              <Text style={styles.modalPrimaryText}>Save to Spend Ledger</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* SHARE TRIP & POSTCARD MODAL */}
      <Modal visible={shareModal} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.rowBetween}>
              <Text style={styles.modalTitle}>💌 Share {trip.title}</Text>
              <TouchableOpacity onPress={() => setShareModal(false)}>
                <Text style={styles.closeX}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.shareCardWarm}>
              <Text style={styles.shareCardHead}>✨ Invite Co-Travelers</Text>
              <Text style={styles.shareCardSub}>
                Friends sign in with Google to add their own Polaroids, flights & shared bills.
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                <TextInput
                  value={inviteEmail}
                  onChangeText={setInviteEmail}
                  placeholder="friend@gmail.com"
                  placeholderTextColor={COLORS.inkSoft}
                  autoCapitalize="none"
                  style={[styles.input, { flex: 1, backgroundColor: '#FFFFFF' }]}
                />
                <TouchableOpacity onPress={handleInviteBuddy} style={styles.inviteBtn}>
                  <Text style={styles.inviteBtnText}>Add</Text>
                </TouchableOpacity>
              </View>
              {trip.coTravelers.length > 0 && (
                <Text style={styles.coTravelerList}>
                  Co-travelers: {trip.coTravelers.join(', ')}
                </Text>
              )}
            </View>

            <View style={styles.shareCardSky}>
              <Text style={[styles.shareCardHead, { color: '#0369A1' }]}>
                📮 Send Read-Only Family Postcard
              </Text>
              <Text style={styles.shareCardSub}>
                Shares your Memories & trip highlights via WhatsApp/Messages — private receipts & spend stay hidden!
              </Text>
              <TouchableOpacity onPress={handleSharePostcard} style={styles.postcardShareBtn}>
                <Text style={styles.postcardShareText}>Share Postcard Now ✈️</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const TabPill = ({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) => (
  <TouchableOpacity
    onPress={onPress}
    style={[styles.tabPill, active && styles.tabPillActive]}
    activeOpacity={0.85}
  >
    <Text style={[styles.tabPillText, active && styles.tabPillTextActive]}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.canvas },
  missingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  missingText: { fontSize: 16, fontWeight: '700', color: COLORS.ink },
  backBtn: { backgroundColor: COLORS.coralSoft, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 99 },
  backBtnText: { color: COLORS.coralDark, fontWeight: '800' },

  topHeader: { position: 'relative' },
  headerNavRow: {
    position: 'absolute',
    top: 12,
    left: 14,
    right: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  glassBtn: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 99,
  },
  glassBtnText: { fontSize: 12, fontWeight: '800', color: COLORS.ink },
  shareGlassBtn: {
    backgroundColor: COLORS.rose,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 99,
  },
  shareGlassText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
  headerBottomText: { position: 'absolute', bottom: 12, left: 16, right: 16 },
  tripTitle: { fontSize: 21, fontWeight: '900', color: '#FFFFFF' },
  tripDates: { fontSize: 12, color: '#FEF3C7', fontWeight: '700', marginTop: 2 },

  tabsWrap: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tabPill: { flex: 1, paddingVertical: 9, borderRadius: 12, alignItems: 'center' },
  tabPillActive: { backgroundColor: COLORS.coral },
  tabPillText: { fontSize: 11, fontWeight: '800', color: COLORS.inkMuted },
  tabPillTextActive: { color: '#FFFFFF' },

  scrollContent: { padding: 16, paddingBottom: 42 },
  sectionGap: { gap: 14 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  subHeading: { fontSize: 15, fontWeight: '900', color: COLORS.ink },
  tinyNote: { fontSize: 11, color: COLORS.emerald, fontWeight: '700', marginTop: 1 },
  actionPill: {
    backgroundColor: COLORS.coral,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 99,
  },
  actionPillText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  actionPillSoft: {
    backgroundColor: COLORS.coralSoft,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 99,
  },
  actionPillSoftText: { color: COLORS.coralDark, fontSize: 12, fontWeight: '800' },

  // Polaroid Memory Card
  polaroidCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 12,
    paddingBottom: 14,
    borderWidth: 1,
    borderColor: '#FED7AA',
    marginTop: 4,
    ...SHADOWS.polaroid,
  },
  tapeStrip: {
    width: 64,
    height: 14,
    backgroundColor: 'rgba(253, 224, 71, 0.55)',
    alignSelf: 'center',
    marginTop: -18,
    marginBottom: 8,
    borderRadius: 3,
  },
  polaroidBody: { paddingTop: 10, gap: 6 },
  polaroidTitle: { fontSize: 15, fontWeight: '900', color: COLORS.ink, flex: 1 },
  polaroidDate: { fontSize: 11, color: COLORS.inkSoft, fontWeight: '700' },
  polaroidNote: { fontSize: 13, color: COLORS.inkMuted, lineHeight: 19 },
  polaroidFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  moodTag: {
    backgroundColor: COLORS.coralSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
  },
  moodTagText: { fontSize: 11, fontWeight: '800', color: COLORS.coralDark },
  authorTag: { fontSize: 11, color: COLORS.inkSoft, fontWeight: '600' },
  coverAction: { fontSize: 11, fontWeight: '800', color: COLORS.indigo },

  // Stays
  stayCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FED7AA',
    padding: 15,
    gap: 6,
    ...SHADOWS.card,
  },
  stayBadge: {
    backgroundColor: COLORS.emeraldSoft,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 99,
  },
  stayBadgeText: { fontSize: 10, fontWeight: '900', color: '#047857' },
  confCode: { fontSize: 12, fontWeight: '800', color: COLORS.indigo },
  stayName: { fontSize: 16, fontWeight: '900', color: COLORS.ink, marginTop: 2 },
  stayDates: { fontSize: 12, color: COLORS.inkMuted, fontWeight: '600' },
  stayAddr: { fontSize: 12, color: COLORS.inkMuted },
  stayCostBox: {
    marginTop: 4,
    backgroundColor: COLORS.canvas,
    borderRadius: 12,
    padding: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stayCostText: { fontSize: 12, fontWeight: '800', color: COLORS.ink },
  cppText: { fontSize: 12, fontWeight: '900', color: COLORS.coralDark },

  // Spend
  spendSummaryCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 15,
    gap: 10,
    ...SHADOWS.card,
  },
  spendTotal: { fontSize: 14, fontWeight: '900', color: COLORS.coralDark },
  catBar: {
    height: 10,
    borderRadius: 99,
    backgroundColor: '#F5F5F4',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  catLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  legendChip: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: COLORS.inkMuted, fontWeight: '700' },

  expenseCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    padding: 13,
    gap: 10,
  },
  expLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  expIconBox: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  expMerchant: { fontSize: 14, fontWeight: '800', color: COLORS.ink },
  expSub: { fontSize: 11, color: COLORS.inkMuted, marginTop: 2 },
  expHome: { fontSize: 14, fontWeight: '900', color: COLORS.ink },
  peekLink: { fontSize: 11, fontWeight: '800', color: COLORS.coral, marginTop: 2 },
  receiptDrawer: {
    backgroundColor: '#FAFAF9',
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D6D3D1',
    padding: 10,
    gap: 8,
  },
  receiptPrivateBadge: { fontSize: 11, fontWeight: '800', color: '#047857' },
  receiptImg: { width: '100%', height: 180, borderRadius: 8 },
  receiptMono: { fontSize: 11, color: COLORS.inkMuted, fontFamily: 'monospace', lineHeight: 16 },

  // Empty
  emptyBox: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: COLORS.border,
    padding: 22,
    alignItems: 'center',
    gap: 6,
  },
  emptyTitle: { fontSize: 15, fontWeight: '900', color: COLORS.ink },
  emptySub: { fontSize: 12, color: COLORS.inkMuted, textAlign: 'center', lineHeight: 18 },
  emptyBtn: {
    marginTop: 6,
    backgroundColor: COLORS.coral,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 99,
  },
  emptyBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },

  // Modals
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(28, 25, 23, 0.55)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    gap: 12,
  },
  modalTitle: { fontSize: 17, fontWeight: '900', color: COLORS.ink },
  closeX: { fontSize: 18, fontWeight: '800', color: COLORS.inkMuted, padding: 4 },
  photoPickBtn: {
    flex: 1,
    backgroundColor: COLORS.coralSoft,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: 'center',
  },
  photoPickText: { color: COLORS.coralDark, fontWeight: '800', fontSize: 13 },
  previewMemImg: { width: '100%', height: 140, borderRadius: 14 },
  input: {
    backgroundColor: COLORS.canvas,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: COLORS.ink,
    fontWeight: '600',
  },
  moodChip: {
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 99,
  },
  moodChipActive: { backgroundColor: COLORS.coral, borderColor: COLORS.coral },
  moodChipText: { fontSize: 12, fontWeight: '700', color: COLORS.ink },
  modalPrimaryBtn: {
    backgroundColor: COLORS.coral,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  modalPrimaryText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14 },

  // Share Modal Cards
  shareCardWarm: {
    backgroundColor: '#FFF7ED',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#FED7AA',
    padding: 14,
    gap: 6,
  },
  shareCardSky: {
    backgroundColor: '#F0F9FF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    padding: 14,
    gap: 8,
  },
  shareCardHead: { fontSize: 14, fontWeight: '900', color: COLORS.coralDark },
  shareCardSub: { fontSize: 12, color: COLORS.inkMuted, lineHeight: 17 },
  inviteBtn: {
    backgroundColor: COLORS.coral,
    paddingHorizontal: 16,
    borderRadius: 12,
    justifyContent: 'center',
  },
  inviteBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  coTravelerList: { fontSize: 11, fontWeight: '700', color: COLORS.coralDark, marginTop: 4 },
  postcardShareBtn: {
    backgroundColor: COLORS.sky,
    paddingVertical: 11,
    borderRadius: 14,
    alignItems: 'center',
  },
  postcardShareText: { color: '#FFFFFF', fontWeight: '900', fontSize: 13 },
});
