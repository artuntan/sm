# Instagram Reels Benchmark Design

## Amaç

Ajans kullanıcısı bir Instagram username girdiğinde sistem, public professional Instagram hesabı için caption'ında `#işbirliği` veya `#isbirligi` bulunmayan en yeni 5 Reels içeriğini seçip bu içeriklerin ortalama izlenmesini göstermeli.

## Ürün Kapsamı

### Desteklenen hesaplar

- public `business` hesaplar
- public `creator` hesaplar

### Desteklenmeyen hesaplar

- private hesaplar
- personal hesaplar
- professional verisi çözülemeyen hesaplar

Bu sınır UI ve API hata mesajlarında açıkça ifade edilmeli.

## Önerilen Karar

İlk sürüm:

- resmi Meta API kullanmalı
- `Business Discovery` tabanlı olmalı
- provider abstraction içermeli
- ama ilk gerçek provider `MetaBusinessDiscoveryProvider` olmalı

Sebep:

- resmi ve daha sürdürülebilir veri yolu
- use-case için gerekli alanlar Meta referansında mevcut
- ürün kapsamı baştan doğru tanımlanırsa scraping ile başlamaya gerek yok

## Kritik Teknik Karar

Gerekli alanlar için uygun Meta entegrasyon yolu seçilmeli.

Prompt seviyesi karar:

- `Instagram Graph API` kullan
- `Business Discovery` kullan
- `caption`, `media_product_type`, `view_count` alanlarını güvenilir biçimde sağlayan login yolunu seç
- gerekli alanları engelliyorsa `Instagram Login` yolunu seçme
- pratikte `Facebook Login for Business` yönünü tercih et

## Kullanıcı Akışı

1. Kullanıcı username girer.
2. Backend username'i normalize eder.
3. Cache kontrol edilir.
4. Cache miss ise Meta Business Discovery çağrısı yapılır.
5. Hedef hesabın public media verisi canonical modele map edilir.
6. Reels filtreleme ve sponsor hashtag elemesi yapılır.
7. En yeni 5 uygun içerik seçilir.
8. Ortalama izlenme hesaplanır.
9. Sonuç UI'da gösterilir.

## Dahil Olan Özellikler

- tek sayfa input + sonuç akışı
- server-side analiz
- Meta API entegrasyonu
- deterministic sponsor hashtag filtresi
- eligible Reels listesi
- ortalama izlenme hesabı
- cache
- testler
- açık hata durumları

## Hariç Tutulan Özellikler

- kullanıcı auth
- ajans çalışma alanı
- geçmiş analiz listesi
- export
- ödeme
- branded content tag / paid partnership badge parsing
- personal/private account support

## Domain Kuralları

### Username normalization

- trim
- leading `@` kaldır
- lowercase

### Caption normalization

- lowercase
- Unicode normalize
- diacritics strip
- Turkish char folding

Normalize edilmiş caption içinde `#isbirligi` varsa içerik sponsorlu kabul edilir.

### Reels tespiti

Bir içerik öncelikli olarak şu kuralla Reels kabul edilir:

- `media_product_type === "REELS"`

Ek güvenlik için canonical model şu raw alanları da taşıyabilir:

- `rawMediaType`
- `rawProductType`

### Son 5 kuralı

1. newest first sırala
2. sadece Reels tut
3. sponsorlu olanları çıkar
4. ilk 5 eligible item'ı al

Eğer 5'ten az eligible içerik varsa:

- mevcut sayıyla devam et
- `sampleSize` alanında gerçek sayı dön

### View kuralı

Canonical alan:

- `views`

Meta raw alanı:

- `view_count`

## Veri Modeli

### Request

```ts
type AnalyzeRequest = {
  username: string;
};
```

### Canonical Reel Item

```ts
type ReelItem = {
  id: string;
  username: string;
  caption: string | null;
  timestamp: string;
  views: number | null;
  permalink: string;
  thumbnailUrl?: string | null;
  provider: "meta";
  rawMediaType?: string | null;
  rawProductType?: string | null;
};
```

### Result

```ts
type AnalyzeResult = {
  username: string;
  averageViews: number | null;
  sampleSize: number;
  analyzedAt: string;
  source: "meta";
  eligibleReels: ReelItem[];
  excludedSponsoredCount: number;
  excludedNonReelCount: number;
  cacheHit: boolean;
  warnings: string[];
};
```

## Sistem Bileşenleri

### 1. UI Layer

- input
- analyze button
- loading, error, success states

### 2. API Layer

- `POST /api/analyze`
- Zod validation
- typed JSON response

### 3. Domain Layer

Sorumluluklar:

- username normalize etmek
- caption normalize etmek
- sponsorlu içerik tespiti
- eligible Reels seçimi
- average hesaplamak

### 4. Provider Layer

Contract:

```ts
interface InstagramDataProvider {
  getRecentMediaByUsername(
    username: string,
    options?: { limit?: number; maxPages?: number }
  ): Promise<ReelItem[]>;
}
```

İlk implementasyon:

- `MetaBusinessDiscoveryProvider`

Local development fallback:

- `MockInstagramProvider`

### 5. Cache Layer

- TTL bazlı hafif cache
- önerilen TTL: 6 saat

## Hata Durumları

API ve UI şu durumları ayırmalı:

- invalid username
- account not found
- account private
- unsupported account type
- insufficient eligible reels
- upstream meta auth/config error
- meta response parse error
- upstream rate limit / timeout

## UI Çıktısı

Success state şu alanları göstermeli:

- username
- average views
- sample size
- analyzed time
- source = Meta
- dahil edilen Reels listesi
- warning varsa uyarılar

## Mimari Not

Provider abstraction korunmalı, ama bu sürümde ürün mantığı resmi Meta yoluna göre optimize edilmeli. Scraping fallback ancak ileride ayrı bir provider olarak eklenmeli; ilk sürümün ana davranışı buna bağlı olmamalı.
