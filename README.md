# snack-calculator v3

부부 두 사람이 함께 쓰는 개인용 과자 가격 비교 웹앱입니다. 상품 규격, 판매처별 가격/행사, 개인별 만족도 별점, 가격 이력을 한 표에서 관리하고 개당/100g당 가격과 가성비를 비교합니다.

## 핵심 기능

- 쿠팡 / GS25 / 이마트24 상품 후보 검색
- 동네마트 열을 자유롭게 추가하고 가격 직접 입력
- 상품명 + 브랜드 + 중량 + 개수 + 바코드 기반 후보 매칭
- 한 번 선택한 판매처 상품 ID를 다음 검색에서 최우선 표시
- 결제금액 / 개당 / 100g당 가격 비교
- `1+1`, `2+1`, `3+1`, 배송비, 구매수량 반영
- 사용자별 별점 저장 (`나`, `배우자`처럼 이름을 다르게 사용)
- 가격 저장/후보 선택 시 가격 이력 자동 기록 및 등락 표시
- 두 기기 공유용 household 동기화
- Supabase 없이도 로컬 JSON 파일에 서버 데이터 영구 저장
- Supabase를 연결하면 같은 household 키로 원격 동기화
- 모바일 홈 화면 설치 및 정적 화면 오프라인 캐시(PWA)

## 가장 간단한 실행

Node.js 20 이상이 필요합니다.

```bash
npm start
```

브라우저에서 `http://localhost:3000`으로 접속합니다.

Supabase 환경변수가 없으면 서버 데이터는 자동으로 `data/snack-data.json`에 저장됩니다. 이 파일은 `.gitignore`에 포함되어 GitHub에 올라가지 않습니다.

### 같은 집/네트워크에서 둘이 쓰기

1. 한 PC에서 `npm start`를 실행합니다.
2. PC의 LAN IP를 확인합니다. 예: `192.168.0.10`.
3. 두 휴대폰에서 `http://192.168.0.10:3000`으로 접속합니다.
4. `사용자/공유`에서 두 기기에 **같은 공유 가구키**를 넣습니다.
5. 사용자 이름은 각각 다르게 설정합니다. 예: `남편`, `아내`.
6. 한쪽에서 변경한 뒤 `☁️ 저장`, 다른 쪽에서 `☁️ 불러오기`를 누르면 합쳐집니다.

별점은 사용자 이름별로 따로 저장되고 상품/가격/가격이력은 함께 공유됩니다.

## Supabase 사용(선택)

집 밖에서도 같은 데이터를 쓰거나 서버를 다른 환경에 띄울 때만 필요합니다.

1. Supabase 프로젝트에서 `supabase.sql`을 실행합니다.
2. `.env.example`을 참고해 `.env`를 만듭니다.
3. 아래처럼 실행합니다.

```bash
node --env-file=.env server.js
```

필요한 환경변수:

```text
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

`SUPABASE_SERVICE_ROLE_KEY`는 브라우저 코드나 `config.js`에 절대 넣지 않습니다. 서버에서만 사용합니다.

## 가격 비교 계산

`판매가격`은 한 묶음/한 판매단위의 가격이고 `판매 묶음 수`는 실제 결제하는 판매단위 수입니다.

- 1+1: 구매 1개마다 1개 추가
- 2+1: 구매 2개마다 1개 추가
- 3+1: 구매 3개마다 1개 추가
- 배송비는 전체 결제금액에 한 번 추가
- 상품의 총중량/구성 개수를 기준으로 100g당/개당 가격 계산

예를 들어 2+1 상품을 `판매 묶음 수=2`로 입력하면 2개 가격을 결제하고 3개를 받은 것으로 계산합니다. `판매 묶음 수=1`이면 무료 상품은 발생하지 않습니다.

## 상품 검색 구조

모든 판매처 Adapter는 다음 형식으로 정규화됩니다.

```js
{
  retailer,
  name,
  price,
  url,
  image,
  productId,
  weight,
  count,
  barcode,
  promotion,
  stock,
  storeId
}
```

현재 판매처:

- `coupang`
- `gs25`
- `emart24`

API:

```text
GET /api/search?q=몽쉘&retailer=coupang
GET /api/search?q=몽쉘&retailer=gs25
GET /api/search?q=몽쉘&retailer=emart24
```

상품 사이트의 HTML 구조/접근 정책이 바뀌면 자동 검색이 제한될 수 있습니다. 이 경우 앱은 공식 검색 화면으로 이동해 사용자가 가격을 확인하고 직접 입력할 수 있으며, 기존 비교/이력/공유 기능은 그대로 동작합니다.

## 공유/이력 API

```text
GET  /api/household?householdId=<공유키>
PUT  /api/household?householdId=<공유키>
GET  /api/history?householdId=<공유키>&productId=<상품ID>&storeId=<판매처ID>
POST /api/history?householdId=<공유키>
```

Supabase가 설정되어 있으면 DB를 사용하고, 없으면 로컬 JSON 저장소를 사용합니다.

## 개발/검증

```bash
npm run check
npm test
npm run verify
```

GitHub Actions에서도 `refactor-v3-step1` push와 `main` 대상 PR에 대해 `npm run verify`를 실행합니다.

주요 테스트 대상:

- 행사 수량 계산
- 결제/개당/100g 단가
- 상품명/규격 파싱
- 바코드 및 이전 선택 상품 우선 매칭
- 가격 이력
- 로컬 영구 저장

## 프로젝트 구조

```text
src/
  app.js
  styles.css
  domain/
    price-calculator.js
    matcher.js
    history.js
api/
  search.js
  household.js
  history.js
  db.js
  local-store.js
  retailers/
    common.js
    coupang.js
    gs25.js
    emart24.js
tests/
```

`api/snapshot.js`와 `user_snapshots` 테이블은 v2 데이터 호환을 위해 당분간 유지합니다. 신규 v3 클라이언트는 household API를 사용합니다.
