# Vercel 배포 가이드

이 앱을 부부 두 사람이 모바일에서 주소 하나로 사용하기 위한 권장 배포 방식입니다.

## 최종 구조

```text
GitHub repository
   ↓
Vercel
   ├─ 정적 웹앱 / PWA
   ├─ /api/search
   ├─ /api/household
   └─ /api/history
          ↓
      Supabase
      ├─ 공유 데이터
      └─ 가격 이력
```

Vercel의 서버리스 파일시스템은 영구 저장소가 아니므로, **모바일 두 기기 공유용으로 배포할 때는 Supabase 연결을 권장합니다.**

## 1. Supabase 준비

1. Supabase에서 새 프로젝트를 만듭니다.
2. SQL Editor에서 저장소의 `supabase.sql` 전체를 실행합니다.
3. Project Settings에서 아래 두 값을 확인합니다.
   - Project URL
   - service_role key

`service_role` 키는 절대 `config.js`, HTML, 브라우저 JS에 넣지 않습니다. Vercel Environment Variables에만 저장합니다.

## 2. Vercel에서 GitHub 저장소 연결

1. Vercel에 로그인합니다.
2. `Add New → Project`를 누릅니다.
3. GitHub의 `jesuishc/snack-calculator` 저장소를 Import 합니다.
4. 테스트 중에는 Production Branch를 `refactor-v3-step1`로 설정하거나 해당 브랜치를 Preview Deployment로 배포합니다.
5. Framework Preset은 `Other`로 둡니다.
6. Build Command는 비워둡니다.
7. Output Directory도 비워둡니다.

루트의 `vercel.json`과 `/api/*.js`를 Vercel이 자동으로 사용합니다.

## 3. Vercel 환경변수

Vercel Project Settings → Environment Variables에 아래 두 값을 추가합니다.

```text
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

적용 환경은 최소한 Production에 체크합니다. Preview 브랜치에서도 실제 공유 테스트를 하려면 Preview에도 체크합니다.

환경변수를 추가하거나 수정한 뒤에는 Redeploy가 필요합니다.

## 4. 배포 후 확인

Vercel에서 아래와 비슷한 URL이 발급됩니다.

```text
https://snack-calculator-xxxx.vercel.app
```

두 휴대폰에서 이 주소를 엽니다.

각 기기에서:

1. `사용자/공유`를 엽니다.
2. **공유 가구키는 두 기기에서 완전히 동일하게** 입력합니다.
3. 사용자 이름은 서로 다르게 입력합니다. 예: `남편`, `아내`.
4. 한쪽에서 과자를 추가하고 `☁️ 저장`합니다.
5. 다른 쪽에서 `☁️ 불러오기`를 눌러 같은 데이터가 나타나는지 확인합니다.
6. 서로 다른 별점을 입력해 개인별 별점이 구분되는지 확인합니다.

공유 가구키는 비밀번호처럼 취급하세요. 예:

```text
our-snack-home-8f4d91c2-2026
```

짧은 `1234`, 성씨, 전화번호 등 추측 가능한 값은 사용하지 않는 편이 좋습니다.

## 5. 모바일 홈 화면에 추가

Vercel은 HTTPS이므로 PWA 서비스워커가 정상 동작합니다.

### Android / Chrome

Chrome 메뉴 → `홈 화면에 추가` 또는 `앱 설치`

### iPhone / Safari

공유 버튼 → `홈 화면에 추가`

이후 일반 앱처럼 아이콘으로 실행할 수 있습니다.

## 6. 배포 테스트 체크리스트

- 메인 화면이 HTTPS에서 정상 표시됨
- 과자 추가/삭제
- 동네마트 열 추가/삭제
- 직접 가격 입력
- 결제금액 / 개당 / 100g당 계산
- 1+1 / 2+1 / 3+1 계산
- 쿠팡 상품 후보 조회
- GS25 상품 후보 조회
- 이마트24 상품 후보 조회
- 선택 상품 ID 기억
- 저장된 상품 가격 일괄 갱신
- 가격 이력 확인
- 두 휴대폰 household 저장/불러오기
- 사용자별 별점 분리
- 한 기기에서 삭제한 항목이 다른 기기 동기화 후 되살아나지 않음
- 홈 화면 추가 후 앱처럼 실행됨

## 판매처 자동조회에 대한 주의

쿠팡, GS25, 이마트24 자동조회는 각 판매처의 공개 웹페이지 구조에 의존합니다. 해당 사이트가 HTML 구조나 접근 정책을 변경하면 특정 판매처 자동조회가 일시적으로 실패할 수 있습니다.

이 경우에도 앱의 수동 가격 입력, 가격 비교, 공유, 가격 이력 기능은 계속 사용할 수 있습니다.

## main 반영 전 권장 순서

1. `refactor-v3-step1`을 Vercel Preview 또는 임시 Production Branch로 배포
2. 두 휴대폰에서 실제 사용 테스트
3. 문제가 없으면 `main`으로 병합
4. Vercel Production Branch를 `main`으로 변경

이렇게 하면 현재 운영 중인 `main`을 건드리지 않고 모바일 실사용 검증을 먼저 할 수 있습니다.
