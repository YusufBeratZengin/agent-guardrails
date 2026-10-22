# Security policy

Version 0.1.x is the initial supported line. This project provides defense in depth, not agent isolation or a guarantee that all sensitive actions are intercepted. Read [the threat model](docs/threat-model.md).

Do not put live credentials, personal information or production transcripts in an issue, reproduction, config, test or audit log. Revoke exposed credentials through their issuer rather than sharing them here.

For a security report, use the repository host's private vulnerability reporting feature if it has been enabled. No private reporting channel is provisioned by this source checkout. If private reporting is unavailable, open an issue requesting a private channel without exploit details or sensitive values. Do not assume a public issue is confidential. No response-time guarantee is offered.

A useful sanitized report includes package/Node/agent versions, operating system, a synthetic payload, expected versus observed decision, relevant redacted config and a proposed regression test. Missing coverage within the stated limits is welcome feedback, even when it is not a security boundary violation.
