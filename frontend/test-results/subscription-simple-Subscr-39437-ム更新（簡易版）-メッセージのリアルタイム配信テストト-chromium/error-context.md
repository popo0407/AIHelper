# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e2]:
    - generic [ref=e4]:
      - generic [ref=e5]:
        - heading "AI常駐型グループチャット" [level=1] [ref=e6]
        - paragraph [ref=e7]: メールアドレスとパスワードでログインしてください
      - generic [ref=e8]:
        - heading "ログイン" [level=2] [ref=e9]
        - alert [ref=e10]: User does not exist.
        - generic [ref=e11]:
          - generic [ref=e12]:
            - generic [ref=e13]: メールアドレス
            - textbox "メールアドレス" [ref=e14]:
              - /placeholder: user@example.com
              - text: test@example.com
          - generic [ref=e15]:
            - generic [ref=e16]: パスワード
            - textbox "パスワード" [ref=e17]:
              - /placeholder: ••••••••
              - text: TestPass123!
          - button "ログイン" [ref=e18] [cursor=pointer]
        - paragraph [ref=e19]: アカウントをお持ちでない場合は、管理者にお問い合わせください。
  - generic:
    - generic [ref=e22] [cursor=pointer]:
      - img [ref=e23]
      - generic [ref=e25]: 1 error
      - button "Hide Errors" [ref=e26]:
        - img [ref=e27]
    - status [ref=e30]:
      - generic [ref=e31]:
        - img [ref=e33]
        - generic [ref=e35]:
          - text: Static route
          - button "Hide static indicator" [ref=e36] [cursor=pointer]:
            - img [ref=e37]
  - alert [ref=e40]
```