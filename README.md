# snack-calculator

과자 가격과 만족도 별점을 이용해 가성비를 비교하는 모바일 웹앱입니다.

## 실행

Node.js 20 이상이 필요합니다.

```bash
npm start
```

브라우저에서 `http://localhost:3000`으로 접속합니다.

## 가격 검색

- 쿠팡 검색결과 페이지
- GS25 공식 행사상품 페이지

위 공개 웹페이지를 서버에서 읽어 상품명과 가격을 추출합니다.

`GET /api/prices?q=몽쉘&retailer=all`

`retailer`는 `all`, `coupang`, `gs25`를 지원합니다.

## 주의사항

- GitHub Pages는 정적 호스팅이므로 가격 조회 API가 작동하지 않습니다.
- Render, Railway, Fly.io 등 Node 서버를 실행할 수 있는 호스팅에 배포해야 합니다.
- 판매처의 페이지 구조 또는 접근 정책이 바뀌면 크롤러 수정이 필요할 수 있습니다.
- 가격은 묶음 수량, 옵션, 회원 할인, 점포 및 행사 조건에 따라 실제 결제 가격과 다를 수 있습니다.
