# Instagram Reels Benchmark Research

## Problem

Ajans kullanıcısı bir Instagram username girecek. Sistem:

1. Hedef hesabın son içeriklerini inceleyecek.
2. Sadece Reels içeriklerini dikkate alacak.
3. Caption içinde `#işbirliği` veya `#isbirligi` geçenleri hariç tutacak.
4. Uygun son 5 Reels için ortalama izlenme sayısını verecek.

## Güncel Sonuç

Evet, bu işi resmi Meta API ile yürütmek daha doğru bir ürün kararı olabilir.

Ama doğru kapsam şu olmalı:

- sadece `public professional account`
- yani `business` veya `creator`
- `personal` ve `private` hesaplar kapsam dışı

Bu kapsam kabul edilirse en iyi yaklaşım:

- `Meta API-first`
- `Business Discovery` tabanlı veri çekme
- provider abstraction korunsun
- ama ilk gerçek provider resmi Meta provider olsun

## Resmi Kaynaklardan Çıkan Ana Bulgular

### 1. Platform business ve creator hesaplarını destekliyor

Instagram Platform overview dokümanı, platformun Instagram professional accounts için olduğunu açıkça söylüyor. Professional account kapsamı business ve creator hesapları içeriyor.

Pratik anlamı:

- creator hesaplar prensipte kapsama dahil
- kişisel hesaplar bu ürün için güvenli hedef değil

### 2. Başka bir public professional hesabın verisi Business Discovery ile okunabiliyor

Business Discovery endpoint'i, app'e bağlı profesyonel Instagram kullanıcısı üzerinden başka bir public professional hesabın public alanlarını okumayı hedefliyor.

Bu use-case için kritik nokta:

- kullanıcı sisteme bir hedef username giriyor
- sistem o username için public professional profile verisini okuyabiliyor
- media edge üzerinden son içeriklere ulaşabiliyor

### 3. Reels tespiti ve view sayısı için gerekli alanlar resmi referansta var

IG Media referansında şu alanlar kritik:

- `media_product_type`
- `media_type`
- `caption`
- `timestamp`
- `permalink`
- `thumbnail_url`
- `view_count`

Özellikle:

- `media_product_type = REELS` ile Reels tespiti yapılabilir
- `view_count` Reels view değeri için kullanılabilir

### 4. Login yolu önemli

IG Media referansında bazı alanlar için `Instagram API with Facebook Login only` notu geçiyor. Özellikle caption ve media product type gibi alanlara güvenilecekse, MVP'yi yanlış login yolu üzerine kurmamak gerekiyor.

Bu yüzden ürün prompt'unda şu teknik karar net olmalı:

- `Facebook Login for Business / Instagram Graph API` yolunu tercih et
- gerekli alanları vermeyen login akışını seçme

### 5. Business Discovery sample'larında business ifadesi geçse de ürün kapsamı creator'ı da hedefleyebilir

Business Discovery örneklerinde sıkça `Instagram Business IG User` ifadesi görünüyor. Buna karşın platform overview professional account kavramını business + creator olarak tanımlıyor.

Bu yüzden doğru mühendislik yaklaşımı:

- creator account support'u ürün kapsamında tasarla
- ama canlı entegrasyonda en az bir public creator hesap ile doğrula
- doğrulanmamış davranışı kesin gerçek gibi sunma

## MVP İçin Net Ürün Kararı

### Doğru kapsam

İlk sürüm şu soruyu cevaplasın:

> Public professional Instagram hesabının sponsorluk etiketi taşımayan son 5 Reels içeriğinin ortalama izlenmesi nedir?

### Kapsam dışı

- private hesaplar
- personal hesaplar
- branded content tag gibi ileri seviye sponsor tespiti
- collab parsing
- auth, billing, ajans workspace, export

## Sistem Nasıl Çalışmalı

1. Kullanıcı username girer.
2. Backend username'i normalize eder.
3. Server-side Meta client, app'e bağlı profesyonel IG user üzerinden Business Discovery çağrısı yapar.
4. Hedef hesabın media listesi alınır.
5. `media_product_type === REELS` olanlar seçilir.
6. Caption normalize edilir.
7. `#işbirliği` ve `#isbirligi` varyasyonları tek kuralla dışlanır.
8. En yeni 5 eligible Reels alınır.
9. `view_count` ortalaması hesaplanır.
10. UI sonucu ve dahil edilen Reels listesini gösterir.

## Domain Kuralları

### Username normalization

- trim
- leading `@` kaldır
- lowercase

### Caption sponsor normalization

- lowercase
- Unicode normalize
- diacritics strip
- Turkish karakter fold

Son kontrol:

- normalize edilmiş caption içinde `#isbirligi` varsa içerik hariç tutulur

### Selection rule

1. newest first sırala
2. only reels
3. sponsored olanları at
4. kalanlardan ilk 5 taneyi al

### Average rule

- ana kaynak `view_count`
- canonical field adı `views`
- provider raw alanı ne olursa olsun domain katmanında `views` olarak normalize et

## Teknik Riskler

### Risk 1: Hedef hesap professional değil

Bu beklenen bir ürün davranışıdır, bug değildir.

Sistem açık hata dönmeli:

- account not found
- private account
- unsupported account type
- professional data unavailable

### Risk 2: Creator account canlı doğrulaması

Kod creator kapsamını hedeflemeli, fakat README ve sonuç notlarında canlı creator doğrulamasının hangi hesap üzerinde yapıldığı açık yazılmalı.

### Risk 3: App review / business verification

Ürün prompt'unda bu operasyonel gerçeklik yer almalı:

- advanced access
- app review
- business verification

MVP kodu bunları bypass edemez; sadece hazır altyapıyı kurabilir.

## Son Tavsiye

Bu özellik için en iyi karar artık:

- `Meta official API-first`
- `public professional accounts only`
- `Business Discovery + IG Media fields`
- `server-side token based MVP`
- `mock fallback sadece local dev için`

Scraping fallback ancak ikinci faz opsiyonu olarak düşünülmeli. İlk prompt artık scraping-first değil, Meta-first olmalı.
