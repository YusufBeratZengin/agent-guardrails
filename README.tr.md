# agent-guardrails

[![CI](https://github.com/YusufBeratZengin/agent-guardrails/actions/workflows/ci.yml/badge.svg)](https://github.com/YusufBeratZengin/agent-guardrails/actions/workflows/ci.yml) [![Lisans: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![Node >=20](https://img.shields.io/badge/node-%3E%3D20-green.svg)](package.json) [![npm sürümü](https://img.shields.io/npm/v/agent-guardrails.svg)](https://www.npmjs.com/package/agent-guardrails)

Yapay zekâ ile kod yazan ajanlarda yaygın anahtar sızıntılarını ve tehlikeli komutları yakalayan, dış işlemlerden önce kullanıcıya soran yerel hook paketi.

Node.js 20+ · ESM · Çalışma zamanında ek bağımlılık yok · Ağ isteği ve telemetri yok

[English](README.md) · [Ayarlar](docs/configuration.md) · [Sınırlar](docs/threat-model.md) · [Örnekler](docs/examples.md)

![Gerçek CLI demosu: outbound kuralı git push öncesinde kullanıcı onayı ister](docs/demo.svg)

`node examples/demo.mjs` çıktısının ilk örneği; incelenen komutlar çalıştırılmaz. [Tam çıktı aşağıda](#bir-engelleme-nasıl-görünür).

## Neden agent-guardrails?

- **Komutla birlikte içeriği de denetler.** Araç girdilerinde anahtar biçimlerini tarar; zincirlenmiş komutları ve açıkça yazılmış sarmalayıcı komutları tehlikeli işlemler açısından inceler.
- **Her dış işlemde yeniden sorar.** Eşleşen gönderim, push ve yayın çağrılarında yeni bir `ask` kararı döndürür; onay arayüzünü ajan yönetir.
- **Kurallar yerel ve incelenebilirdir.** Ayarlanabilir beş kural, maskelenmiş bulgular ve isteğe bağlı JSONL günlüğü sunar; çalışma zamanında ek bağımlılık veya dış servis kullanmaz.

## Bir dakikada kurulum

Node.js 20 veya üzeri kuruluysa, deponun kök klasöründe aşağıdaki komutları POSIX shell ya da PowerShell ile çalıştırın. Paket kurmanız gerekmez:

```sh
node bin/agent-guardrails.mjs init
node examples/demo.mjs
node bin/agent-guardrails.mjs explain outbound
```

`init`, Claude Code ayarını dosyaya yazmadan gösterir. Demo üç sentetik araç çağrısını değerlendirir ve sırasıyla `ask`, `deny`, `deny` kararı verir; incelenen komutları çalıştırmaz.

Hook'u **bu depoda** etkinleştirmek için depo kökünden çalışacak komutu ayara ekleyin:

```sh
node bin/agent-guardrails.mjs init --write --command "node bin/agent-guardrails.mjs hook"
```

`--write`, diğer ayarları korur ve mevcut dosyayı değiştirmeden önce `settings.json.bak.<zaman>` yedeği oluşturur. Aynı komutla tekrar kurulum değişiklik yaratmaz. Claude Code'u yeniden başlatıp `/hooks` ile kurulumu doğrulayın. Başka projede kurulum için [shell ve PATH örneklerine](docs/examples.md) bakın.

### İlk npm sürümü yayımlandıktan sonra

Projenizin kök klasöründe paketi kurun ve yerel bağımlılığı kullanacak hook komutunu kaydedin:

```sh
npm install --save-dev agent-guardrails
npx agent-guardrails init --write --command "npx --no-install agent-guardrails hook"
```

Hook'un çalıştığı ortamda geliştirme bağımlılığı kurulu kalmalı. `--no-install`, hook çalışırken eksik paketin indirilmesini önler. Varsayılan ayar `agent-guardrails hook` kullanır; komut hook sürecinin PATH ortamında bulunmalı. `--command` ile verilen komut aynen kaydedilir; boş olamaz ve tek satır olmalıdır. npm komutları ilk yayından sonrası içindir; npm rozeti yayın yapılana kadar “not found” gösterebilir. Yukarıdaki kaynak kod komutları bugün, npm'e bağlanmadan çalışır.

## Bir engelleme nasıl görünür?

Bu deponun kökünde [sentetik demoyu](examples/demo.mjs) çalıştırın:

```sh
node examples/demo.mjs
```

Demo her payload için bellekte `agent-guardrails test` çağırır. İncelenen komutları çalıştırmaz, sentetik anahtarı dosyaya yazmaz.

<details>
<summary>Tam CLI çıktısı: dış işlem onayı, tehlikeli komut engeli, sır tespiti</summary>

```text
git push
{
  "decision": "ask",
  "findings": [
    {
      "ruleId": "outbound",
      "code": "human-confirmation",
      "message": "Outbound action requires human confirmation for this invocation.",
      "preview": "[REDACTED]",
      "mode": "ask"
    }
  ],
  "output": {
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "ask",
      "permissionDecisionReason": "[outbound:human-confirmation] Outbound action requires human confirmation for this invocation."
    }
  }
}
git reset --hard
{
  "decision": "deny",
  "findings": [
    {
      "ruleId": "destructive",
      "code": "git-reset-hard",
      "message": "Hard reset discards work.",
      "preview": "[REDACTED]",
      "mode": "deny"
    }
  ],
  "output": {
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": "[destructive:git-reset-hard] Hard reset discards work."
    }
  }
}
Write with a synthetic AWS key
{
  "decision": "deny",
  "findings": [
    {
      "ruleId": "secrets",
      "code": "aws-access-key",
      "message": "Potential aws-access-key detected.",
      "preview": "[REDACTED]",
      "mode": "deny"
    }
  ],
  "output": {
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": "[secrets:aws-access-key] Potential aws-access-key detected."
    }
  }
}
```

</details>

Çıktıda hem kural bulguları hem Claude Code'a gönderilecek JSON bulunur. Üçü de geçerli değerlendirme olduğundan `test` çıkış kodu 0'dır; engelleme kararı JSON içinde iletilir. PowerShell'de stdin kullanımı için [yerel nesne örneğine](docs/examples.md#powershell-dry-run) bakın.

```text
KURAL          VARSAYILAN  AMAÇ
secrets        deny        Kimlik bilgileri ve hassas dosya okumaları
destructive    deny        Veri kaybına yol açan komutlar
outbound       ask         Her dış işlemde kullanıcı onayı
pii            off         İsteğe bağlı kişisel veri taraması
protect-paths  deny        Korunan yollara yazma denetimi
```

## Hangi kurallar var?

| Kural | Varsayılan | Kapsam |
| --- | --- | --- |
| `secrets` | engelle | Anahtar biçimleri, özel anahtarlar, JWT, yüksek entropili parola/token atamaları ve kimlik bilgisi dosyalarını okuma |
| `destructive` | engelle | Hard reset, zorla clean/push, toplu checkout, stash/ref/kurtarma verisi silme, ana branch'i zorla silme, Docker prune, disk biçimlendirme ve üzerine yazma, shred, proje dışı truncate, geniş kapsamlı silme, chmod 777, indirileni doğrudan çalıştırma |
| `outbound` | sor | Gönderim, yayın, birleştirme, harcama araçları; push, PR oluşturma, paket yayını ve yaygın ağ komutları |
| `pii` | kapalı | Dış araçlara giden içerikte e-posta, telefon, Luhn kart kontrolü ve mod-97 IBAN kontrolü |
| `protect-paths` | engelle | Belirlenen klasörlere yazma; başlangıçta `~/.ssh`, `~/.aws`, `~/.gnupg` |

Modlar: `deny` engeller, `ask` kullanıcıya sorar, `warn` uyarır, `off` kuralı kapatır. Aynı çağrıda öncelik **deny > ask > warn > pass** şeklindedir. Temiz çıkan çağrılar ajanın kendi izin denetimini devre dışı bırakmaz. İzinler önbelleğe alınmaz; eşleşen her işlem yeniden sorulur. `--force-with-lease` destructive kuralından geçse bile push için outbound kuralı sorar.

## Neden yalnızca permissions.deny yeterli değil?

Claude Code izin desenleri araçları ve açık komutları kısıtlamak için yararlıdır. Bu hook'lar payload içeriğinde sır ve isteğe bağlı kişisel veri taraması, zincirlenmiş komutları ve açık wrapper'ları ayrıştırma, her dış işlem için `ask` kararı ve isteğe bağlı maskelenmiş günlük ekler. Ajanın kendi izinlerini de açık tutun; ayrıştırıcının kapsamı ve ajanın uyguladığı izin akışı sınırlıdır.

## Örnekler

[Çalıştırılabilir örnekler](docs/examples.md): [Claude ayarı](examples/settings.snippet.json), [sıkı ekip profili](examples/.agent-guardrails.json), [POSIX pre-commit hook](examples/pre-commit.sh) ve [GitHub Actions taraması](examples/github-actions-scan.yml).

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

Varsayılan olarak `.agent-guardrails.json` ve `~/.agent-guardrails.json` dosyalarına yazma onay ister (`askPaths`); ajan kendi kurallarını sessizce kapatamaz. `paths` dizisini değiştirdiğinizde korumak istediğiniz bütün yolları yazın. `.env.example` için okuma izni vermek içerik taramasını kapatmaz. Entropi eşiği, desenler ve günlük seçenekleri [ayar referansında](docs/configuration.md); editör desteği için [JSON Schema](schema/config.schema.json) bulunur.

## Komutlar

```text
agent-guardrails init [--write] [--command <string>]
agent-guardrails hook
agent-guardrails test '<json>'
agent-guardrails scan <yol>
agent-guardrails explain <kural-id>
```

`hook`, stdin üzerinden Claude Code `PreToolUse` JSON verisini okur. Engelleme ve sorma kararları stdout'a JSON olarak yazılır; çıkış kodu 0'dır. Bozuk girdi, ayar veya günlük hatası çıkış kodu 2 ile işlemi engeller. `test` kuru denemedir: komutu çalıştırmaz, günlük yazmaz ve geçerli değerlendirmede 0 döner. [PowerShell örneği](docs/examples.md#powershell-dry-run) kullanılabilir.

`scan` için çıkış kodları: **0 temiz, 1 bulgu, 2 hata**. Hook modu kapalı olsa da sır taraması yapar; `.env` gibi gitignore'daki dosyaları da tarar. Sembolik bağlantıları ve `.git`, `node_modules`, `coverage`, `.tmp-test` ile eski geçici çalışma klasörlerini atlar. Bulgu çıktısında dosya yolu, kural kodu ve tamamen maskelenmiş önizleme bulunur; yakalanan değer yazılmaz. Git geçmişini veya yalnızca stage'deki içeriği taramaz. [Pre-commit örneği](docs/examples.md#pre-commit) depodadır.

## Bilmeniz gereken sınırlar

Bu paket ek bir güvenlik katmanıdır; **sandbox değildir**. Kararlı bir ajan komutu gizleyebilir, bir script üzerinden işlem yaptırabilir, ayarları değiştirebilir veya kapsanmayan bir araç kullanabilir. Yol denetimi metinsel normalizasyon yapar; symlink, hardlink ve dosya sistemi yarışlarını çözmez. Komut ayrıştırıcı Bash, cmd veya PowerShell yorumlayıcısı değildir. Kişisel veri denetimi eksik yakalayabilir veya yanlış alarm verebilir. Başka bir programın okuyup yüklediği dosyanın içeriği önceden incelenmez. Modele araç çağrısı olmadan eklenen dosyalar hook'u tetiklemeyebilir.

Ajanın sandbox ve izin ayarlarını, ağ kısıtlarını, sınırlı yetkileri ve insan incelemesini açık tutun. Ayar dosyalarını güvenilmeyen değişikliklerden koruyun. Ayrıntı: [tehdit modeli](docs/threat-model.md).

## Ajan desteği

Claude Code `PreToolUse` desteği hazırdır; protokol [ayrı adapter modülündedir](src/adapters/claude-code.mjs). **Codex CLI desteği planlanmıştır.** Resmî belgelerde `ask` davranışı henüz desteklenmediği için eksik bir onay kapısı sunulmuyor; notify üzerinden engelleme varsayılmıyor. [Kaynaklar ve entegrasyon notları](docs/adapters.md).

## Günlük

İsteğe bağlı JSONL günlüğü karar, zaman, kural kodu, mod ve `[REDACTED]` önizlemesini kaydeder. Komut, içerik, dosya yolu, araç adı veya oturum kimliği kaydetmez. Günlük yazılamazsa hook engeller. Windows'ta erişim klasörün ACL izinlerine bağlıdır; saklama süresini kullanıcı yönetir.

## Geliştirme

```sh
npm run check
npm run scan
npm run bench
npm run demo
```

Kontrollerden önce geliştirme araçlarını [katkı rehberindeki](CONTRIBUTING.md) gibi kurun. Testler Node'un kendi test altyapısını ve `.tmp-test/` altında geçici dosyaları kullanır. `npm test`, ek bir kapsam servisine ihtiyaç duymadan yerelde ve her CI işinde satır, dal ve fonksiyon kapsamını gösterir. ESLint ve TypeScript yalnız geliştirme bağımlılığıdır. CI, Ubuntu ve Windows üzerinde Node 20/22/24 ile lint, JSDoc tip kontrolü, test ve sır taraması çalıştırır. CodeQL; push, pull request ve haftalık taramalarda JavaScript/TypeScript kodunu inceler. Dependabot, geliştirme bağımlılıklarını ve GitHub Actions sürümlerini haftalık kontrol eder.

`npm run demo`, demodaki ilk gerçek CLI değerlendirmesinden `docs/demo.svg` görselini yeniden üretir. Testler görselin ve iki README'deki çıktıların güncel kaldığını denetler.

Ubuntu CI, süreç açılışı hariç ısınmış çekirdek değerlendirmesinde p95 için 10 ms sınırı uygular. `npm run bench`, çekirdek süresini yeni süreç median/p95 değerlerinden ayrı raporlar. Kısıtlı ortamlarda `npm run bench -- --core-only` alt süreç açmadan yalnızca çekirdeği ölçer. Yerel ölçümde çekirdek p95 değeri 0,142 ms çıktı; sandbox yeni süreç ölçümünü engelledi. [Performans kanıtları ve ölçüm sınırları](docs/threat-model.md#performance-evidence). Disk, antivirüs, Node açılışı ve işletim sistemi toplam süreyi etkiler; donanımdan bağımsız gecikme garantisi verilmez.

## Sık sorulanlar

**Veri dışarı gider mi?** Çalışan paket ağa bağlanmaz. İncelenen komutları çalıştırmaz. Geliştirme paketlerini kurarken paket yöneticiniz kendi kayıt sunucusunu kullanır.

**Sahte anahtar neden engellendi?** Biçim denetlenir, anahtarın geçerliliği sorgulanmaz. `xxxx`, `<your-key>`, `example` gibi açık yer tutucular kullanın. Gerekirse dar bir `allowValues` istisnası ekleyin; gerçek anahtarı ayara yazmayın.

**curl veya salt okunur MCP çağrısı neden soruluyor?** Ağ istemcileri veri yükleyebildiği için curl/wget ve PowerShell web istemcileri varsayılan olarak sorar. `allMcp: true` salt okunur MCP çağrılarını da sorar. `commandPatterns` veya `toolPatterns` dizilerini daraltmadan önce riski değerlendirin; diziler öncekinin tamamını değiştirir.

**`ask` insan onayını garanti eder mi?** Arayüzü ajan yönetir. Etkileşimli izin modunda, kurulu sürümünüzde istemleri doğrulayın ve başka bir hook'tan otomatik onay döndürmeyin. Pakette onay önbelleği veya ayrı bir onay servisi yoktur.

**Başka depoyu koruyabilir miyim?** `protect-paths.paths` içine mutlak veya proje köküne göreli yol ekleyin. Kesin sınır için işletim sistemi düzeyinde izolasyon gerekir.

**Tarama, özel bir sır tarayıcısının yerini tutar mı?** Hayır. Biçim ve entropi sezgileriyle çalışan yerel bir pre-commit yardımcısıdır. Git geçmişi, kodlanmış veri ve kuruma özel kimlik bilgileri için özel bir tarayıcı kullanın.

## Katkı

[Katkı rehberini](CONTRIBUTING.md), [davranış kurallarını](CODE_OF_CONDUCT.md) ve [güvenlik bildirimi yönergelerini](SECURITY.md) okuyun. Yayın otomasyonu, sahibi gerekli ayarları yaptıktan sonra npm trusted publishing kullanır.

## Lisans

MIT · Copyright (c) 2026 Yusuf Berat Zengin
