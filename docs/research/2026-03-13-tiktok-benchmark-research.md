# TikTok Benchmark Research

## Problem

Mevcut Instagram benchmark uygulamasının TikTok karşılığı gerekiyor.

Ajans kullanıcısı bir username girdiğinde sistem ideal olarak:

1. hedef hesabın son public videolarını incelesin
2. organic ve commercial içerikleri ayırsın
3. her bucket için en yeni 5 eligible videoyu seçsin
4. ortalama izlenme hesabı yapsın
5. Instagram ve TikTok yüzeyini UI'da net biçimde ayırsın

## Ana Sonuç

TikTok tarafında Instagram'daki Meta Business Discovery benzeri temiz, genel kullanıma açık, agency-grade resmi yol net değil.

En doğru ürün kararı:

- Instagram tarafını mevcut resmi Meta API akışıyla koru
- TikTok için önce resmi kapasiteyi doğrula
- resmi yol ürün ihtiyacını tam karşılamıyorsa bunu açıkça kabul et
- mimariyi `platform-aware + provider abstraction` olarak kur
- TikTok için `official-ready + fallback-ready` tasarım kullan

## Resmi TikTok Dokümanlarından Çıkan Bulgular

### 1. Display API bu use-case için yeterli değil

TikTok Display API, esas olarak creator'ın kendi profile/video bilgisini başka bir uygulamada göstermeye odaklanıyor.

Pratik sonuç:

- self-authorized veri akışı için uygun olabilir
- arbitrary public influencer username benchmark için doğru temel değil

Kaynak:

- https://developers.tiktok.com/doc/display-api-overview

### 2. Research API public video sorgulama yeteneği sunuyor

TikTok Research API dokümanında public video sorgulama akışı mevcut.

Özellikle `video/query` tarafında şu alanlar kritik:

- `username`
- `view_count`
- `video_description`
- `create_time`

Bu da teknik olarak public içerik query etmenin mümkün olabileceğini gösteriyor.

Kaynaklar:

- https://developers.tiktok.com/doc/research-api-overview/
- https://developers.tiktok.com/doc/research-api-specs-query-videos

### 3. Ama Research API erişimi kısıtlı

Research Tools / Research API herkese açık general-product entegrasyonu gibi görünmüyor; araştırmacı erişimi ve onaylı kullanım çerçevesine bağlı.

Pratik sonuç:

- agency SaaS için doğrudan güvenilecek ana production yol olmayabilir
- erişim ve kullanım uygunluğu önce doğrulanmalı

Kaynak:

- https://developers.tiktok.com/doc/research-api-overview/

### 4. Public metric freshness gecikmeli olabilir

Research API FAQ tarafında public engagement metric'lerinde gecikme olabileceği belirtiliyor. View/like gibi metrikler near-real-time garantisi sunmuyor.

Pratik sonuç:

- canlı benchmark için veri tazeliği riski var
- ajans kullanımında bu açıkça dokümante edilmeli

Kaynak:

- https://developers.tiktok.com/doc/research-api-faqs

### 5. Commercial sinyal için kısmi resmi işaretler var

Pinned videos dokümanında `video_tag` alanı ve `Ad`, `Paid Partnership`, `Regular` gibi değerler görülüyor.

Bu önemli çünkü:

- resmi commercial sinyal bazı yüzeylerde mevcut olabilir
- ama bunun bütün video akışına ne kadar genellendiği dikkatle doğrulanmalı

Kaynak:

- https://developers.tiktok.com/doc/research-api-specs-query-user-pinned-videos

## Ürün İçin Doğru Çıkarım

### Instagram

- mevcut Meta-first yaklaşım doğru
- public professional accounts only
- official production path net

### TikTok

Doğru yaklaşım:

- önce resmi TikTok capability audit yap
- official path arbitrary public username benchmark'i gerçekten destekliyorsa onu kullan
- desteklemiyorsa bunu saklama
- yine de ürünü tıkamamak için provider abstraction ile fallback-ready mimari kur

## Mimari Tavsiye

Tek provider yerine `platform-aware domain` yapısına geç:

- `platform = instagram | tiktok`
- ortak benchmark domain katmanı
- platform-specific fetch / mapping katmanı

Önerilen yön:

- `ContentItem` gibi platform-agnostic canonical type
- shared normalization / benchmark selection / commercial classification
- `InstagramProvider`
- `TikTokProvider`
- platform bazlı factory

## UI Tavsiyesi

Instagram ve TikTok tek akış içinde bulanıklaşmamalı.

En iyi yaklaşım:

- girişte güçlü platform ayrımı
- masaüstünde iki ayrı platform paneli veya güçlü segmented switch
- her platformun kendi state, source, benchmark ve limitation mesajı
- organic/commercial benchmark'lar platform içinde kalmalı
- platformlar arası dil ve renk kodlaması net ayrılmalı

Yani ayrım iki katmanlı olmalı:

1. platform ayrımı: Instagram vs TikTok
2. benchmark ayrımı: Organic vs Commercial

## Güçlü Ürün Kuralı

TikTok tarafında da aynı benchmark güven kuralı korunmalı:

- bucket sadece tam 5 eligible video varsa valid benchmark saysın
- 5'ten azsa average göstermesin
- explicit insufficient-data state dönsün

## Son Tavsiye

Bu genişleme için en güçlü prompt yaklaşımı:

- Opus önce mevcut `app/` kodunu inspect etsin
- sonra resmi TikTok feasibility araştırmasını yapsın
- official capability ile product need arasındaki farkı açıkça raporlasın
- sonra truthful bir implementation yapsın
- UI'da Instagram ve TikTok'u gerçekten iki ayrı ürün yüzeyi gibi ayırsın
