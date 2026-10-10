# Email setup (verification codes)

New accounts must enter a 6-digit code sent to their email, so only real addresses can sign up.

## Locally

Do nothing. Without an email key the server prints the code in the terminal where `node server.js` is running:

```
[DEV EMAIL - not really sent]
To: you@college.ac.in
Your FindIt verification code is 483920.
```

## On a hosted server (Brevo, free: 300 emails per day)

Free Render web services block normal email ports, so the app sends mail through Brevo's web API instead.

1. Create a free account at https://www.brevo.com (no credit card needed).
2. In Brevo, add and verify a **sender** address (a Gmail or college address you can open) under Senders.
3. Open **SMTP & API**, go to **API Keys**, and generate a key.
4. In Render, add these environment variables to the service:

   | Name | Value |
   |---|---|
   | `BREVO_API_KEY` | the key from step 3 |
   | `EMAIL_FROM` | the sender address verified in step 2 |
   | `ALLOWED_EMAIL_DOMAIN` | optional, e.g. `vitbhopal.ac.in` |

5. Save. Render redeploys. Sign up with a real address and check the inbox (and spam).

## If emails do not arrive

- Look at the service logs on Render for a line starting with `Brevo rejected the email`. It names the reason, usually an unverified sender or a wrong key.
- Emails sent from a free Gmail address can land in spam. Mark one as not spam, or tell testers to check the spam folder.
