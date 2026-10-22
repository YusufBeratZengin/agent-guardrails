# agent-guardrails

Yapay zekâ ile kod yazarken sık yapılan tehlikeli işlemleri yakalayan yerel hook paketi. Anahtar ve token sızıntılarını, iş kaybına yol açan komutları engeller; gönderim ve yayın gibi dış işlemlerden önce kullanıcıya sorar. Node.js 20 ve üzeriyle çalışır. Çalışma zamanında ek bağımlılığı yoktur, ağa istek atmaz ve telemetri toplamaz.

[English](README.md) · [Ayarlar](docs/configuration.md) · [Sınırlar](docs/threat-model.md) · [Örnekler](docs/examples.md)

## Bir dakikada kurulum

Bu depoyu indirdiğiniz klasörde:

```sh
npm install --global . --omit=dev --ignore-scripts
cd /projenizin/yolu
agent-guardrails init
agent-guardrails init --write
```

`init` yalnızca Claude Code ayar parçasını gösterir. `--write`, mevcut `.claude/settings.json` dosyasına hook'u ekler; diğer ayarları korur ve dosya varsa `settings.json.bak.<zaman>` adıyla yedekler. Tekrar çalıştırmak aynı hook'u bir daha eklemez. Claude Code'u yeniden başlatıp `/hooks` üzerinden kurulumu doğrulayın. Komut, hook'un PATH ortamında bulunmalı; gerekirse [mutlak yol örneğini](docs/examples.md) kullanın.

0.1.0 sürümü npm yayınına hazırlanmıştır; paketin npm'de yayımlandığı veya adın boşta olduğu varsayılmaz. Bu kurulum yerel depoyu kullanır.

## Hangi kurallar var?

| Kural | Varsayılan | Kapsam |
| --- | --- | --- |
| `secrets` | engelle | Anahtar biçimleri, özel anahtarlar, JWT, yüksek entropili parola/token atamaları ve kimlik bilgisi dosyalarını okuma |
| `destructive` | engelle | Hard reset, zorla clean/push, toplu checkout, stash silme, geniş kapsamlı silme, chmod 777, indirileni doğrudan çalıştırma |
| `outbound` | sor | Gönderim, yayın, birleştirme, harcama araçları; push, PR oluşturma, paket yayını ve yaygın ağ komutları |
| `pii` | kapalı | Dış araçlara giden içerikte e-posta, telefon, Luhn kart kontrolü ve mod-97 IBAN kontrolü |
| `protect-paths` | engelle | Belirlenen klasörlere yazma; başlangıçta `~/.ssh`, `~/.aws`, `~/.gnupg` |

Modlar: `deny` engeller, `ask` kullanıcıya sorar, `warn` uyarır, `off` kuralı kapatır. Aynı çağrıda öncelik **deny > ask > warn > pass** şeklindedir. Temiz çıkan çağrılar ajanın kendi izin denetimini devre dışı bırakmaz. İzinler önbelleğe alınmaz; eşleşen her işlem yeniden sorulur. `--force-with-lease` destructive kuralından geçse bile push için outbound kuralı sorar.

## Ayarlar

Varsayılanlar üzerine önce `~/.agent-guardrails.json`, sonra proje içindeki `.agent-guardrails.json` uygulanır. Nesneler birleştirilir; diziler öncekinin yerini tamamen alır. Yukarı doğru aramada ilk ayar dosyası veya `.git` işareti proje kökünü belirler; ikisi de yoksa hook'un çalışma klasörü kullanılır.

```json
{
  "rules": {
    "secrets": { "allowReadPaths": [".env.example"] },
    "outbound": { "allMcp": true },
    "pii": { "mode": "deny" },
    "protect-paths": { "paths": ["~/.ssh", "../diger-depo"] }
  },
  "audit": { "enabled": false }
}
```

`paths` dizisini değiştirdiğinizde korumak istediğiniz bütün yolları yazın. `.env.example` için okuma izni vermek içerik taramasını kapatmaz. Entropi eşiği, desenler ve günlük seçenekleri [ayar referansında](docs/configuration.md); editör desteği için [JSON Schema](schema/config.schema.json) bulunur.

## Komutlar

```text
agent-guardrails init [--write]
agent-guardrails hook
agent-guardrails test '<json>'
agent-guardrails scan <yol>
agent-guardrails explain <kural-id>
```

`hook`, stdin üzerinden Claude Code `PreToolUse` JSON verisini okur. Engelleme ve sorma kararları stdout'a JSON olarak yazılır; çıkış kodu 0'dır. Bozuk girdi, ayar veya günlük hatası çıkış kodu 2 ile işlemi engeller. `test` kuru denemedir: komutu çalıştırmaz, günlük yazmaz ve geçerli değerlendirmede 0 döner. [PowerShell örneği](docs/examples.md#powershell-dry-run) kullanılabilir.

`scan` için çıkış kodları: **0 temiz, 1 bulgu, 2 hata**. Hook modu kapalı olsa da sır taraması yapar; `.env` gibi gitignore'daki dosyaları da tarar. Sembolik bağlantıları ve `.git`, `node_modules`, `coverage`, `is` klasörlerini atlar. Bulgu çıktısında dosya yolu, kural kodu ve tamamen maskelenmiş önizleme bulunur; yakalanan değer yazılmaz. Git geçmişini veya yalnızca stage'deki içeriği taramaz. [Pre-commit örneği](docs/examples.md#pre-commit) depodadır.

## Bilmeniz gereken sınırlar

Bu paket ek bir güvenlik katmanıdır; **sandbox değildir**. Kararlı bir ajan komutu gizleyebilir, bir script üzerinden işlem yaptırabilir, ayarları değiştirebilir veya kapsanmayan bir araç kullanabilir. Yol denetimi metinsel normalizasyon yapar; symlink, hardlink ve dosya sistemi yarışlarını çözmez. Komut ayrıştırıcı Bash, cmd veya PowerShell yorumlayıcısı değildir. Kişisel veri denetimi eksik yakalayabilir veya yanlış alarm verebilir. Başka bir programın okuyup yüklediği dosyanın içeriği önceden incelenmez. Modele araç çağrısı olmadan eklenen dosyalar hook'u tetiklemeyebilir.

Ajanın sandbox ve izin ayarlarını, ağ kısıtlarını, sınırlı yetkileri ve insan incelemesini açık tutun. Ayar dosyalarını güvenilmeyen değişikliklerden koruyun. Ayrıntı: [tehdit modeli](docs/threat-model.md).

## Ajan desteği

Claude Code `PreToolUse` desteği hazırdır; protokol [ayrı adapter modülündedir](src/adapters/claude-code.mjs). **Codex CLI desteği planlanmıştır.** Resmî belgelerde `ask` davranışı henüz desteklenmediği için eksik bir onay kapısı sunulmuyor; notify üzerinden engelleme varsayılmıyor. [Kaynaklar ve entegrasyon notları](docs/adapters.md).

## Günlük ve geliştirme

İsteğe bağlı JSONL günlüğü karar, zaman, kural kodu, mod ve `[REDACTED]` önizlemesini kaydeder. Komut, içerik, dosya yolu, araç adı veya oturum kimliği kaydetmez. Günlük yazılamazsa hook engeller. Windows'ta erişim klasörün ACL izinlerine bağlıdır; saklama süresini kullanıcı yönetir.

```sh
npm install --ignore-scripts --no-audit --no-fund
npm run check
npm run scan
npm run bench
```

Testler Node'un kendi test altyapısını kullanır. ESLint ve TypeScript yalnız geliştirme bağımlılığıdır. CI, Ubuntu ve Windows üzerinde Node 20/22 ile lint, JSDoc tip kontrolü, test ve sır taraması çalıştırır. Hook için hedef tipik girdilerde 50 ms altıdır; ölçüm kod değerlendirmesiyle yeni süreç açılışını ayrı raporlar. Disk, antivirüs ve işletim sistemi toplam süreyi etkiler.

## Sık sorulanlar

**Veri dışarı gider mi?** Çalışan paket ağa bağlanmaz. İncelenen komutları çalıştırmaz. Geliştirme paketlerini kurarken paket yöneticiniz kendi kayıt sunucusunu kullanır.

**Sahte anahtar neden engellendi?** Biçim denetlenir, anahtarın geçerliliği sorgulanmaz. `xxxx`, `<your-key>`, `example` gibi açık yer tutucular kullanın. Gerekirse dar bir `allowValues` istisnası ekleyin; gerçek anahtarı ayara yazmayın.

**Salt okunur MCP çağrısı neden soruluyor?** `allMcp: true` tüm MCP çağrılarını sorar. Varsayılan ayarda yalnız eşleşen araç adları sorulur. Desen dizileri önceki dizinin tamamını değiştirir.

**Başka depoyu koruyabilir miyim?** `protect-paths.paths` içine mutlak veya proje köküne göreli yol ekleyin. Kesin sınır için işletim sistemi düzeyinde izolasyon gerekir.

MIT · Copyright (c) 2026 Yusuf Berat Zengin
