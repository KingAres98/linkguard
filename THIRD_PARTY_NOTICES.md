# Third-party notices

LinkGuard's own code is released under the MIT License (see `LICENSE`).

LinkGuard also downloads threat data from the sources below. **None of that
data is stored in this repository.** The threat index is built from these
sources each time the site is deployed, and each source keeps its own terms.

---

## Phishing.Database

- **Source:** https://github.com/mitchellkrogza/Phishing.Database
- **Used for:** the list of active phishing domains
- **License:** MIT, reproduced below

```
MIT License

Copyright (c) 2018-2025 Mitchell Krog - github.com/mitchellkrogza
Copyright (c) 2018-2025 Nissar Chababy - github.com/funilrys
Copyright (c) 2018-2025 Phishing.Database Contributors - github.com/Phishing-Database

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## URLhaus (abuse.ch)

- **Source:** https://urlhaus.abuse.ch
- **Used for:** the list of active malware distribution hosts
- **Terms:** free community access under the abuse.ch Fair Use Principles.
  Downloading requires an Auth-Key, which is free from https://auth.abuse.ch/.
  Use by companies or individuals with commercial or for-profit needs may
  require a paid subscription managed by Spamhaus, under separate terms.

---

## If you deploy your own copy of LinkGuard

- You need your own URLhaus Auth-Key. Keep the download address it is part of
  secret (LinkGuard reads it from the `URLHAUS_HOSTFILE_URL` environment
  variable, see `.env.example`).
- You are responsible for following each source's terms for your own use.
  In particular, a commercial deployment may need a paid URLhaus subscription.
- A listing in these sources means a third party reported the domain or host.
  LinkGuard shows it as evidence, not as a verdict.