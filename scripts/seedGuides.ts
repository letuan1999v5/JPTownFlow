/**
 * Script to seed sample guide data into Firestore
 *
 * Run this script to populate the guides collection with sample data.
 * You can run this from a development environment or admin panel.
 */

import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import { GuideType } from '../types/guide';

interface GuideData {
  id: string; // Fixed ID for the guide
  title: {
    vi: string;
    en: string;
    ja: string;
  };
  description: {
    vi: string;
    en: string;
    ja: string;
  };
  content: {
    vi: string;
    en: string;
    ja: string;
  };
  type: GuideType;
  category: string;
  imageUrl?: string;
}

const SAMPLE_GUIDES: GuideData[] = [
  // FREE GUIDES
  {
    id: 'guide-mynumber-registration',
    title: {
      vi: 'Hướng dẫn đăng ký Thẻ My Number',
      en: 'My Number Card Registration Guide',
      ja: 'マイナンバーカード申請ガイド',
    },
    description: {
      vi: 'Hướng dẫn chi tiết cách đăng ký và sử dụng thẻ My Number tại Nhật Bản',
      en: 'Detailed guide on how to register and use My Number card in Japan',
      ja: '日本でマイナンバーカードを申請・使用する方法の詳細ガイド',
    },
    imageUrl: 'https://images.unsplash.com/photo-1554224311-beee2fae2a82?w=800&h=400&fit=crop',
    content: {
      vi: `# Thẻ My Number là gì?

Thẻ My Number (マイナンバーカード) là thẻ căn cước công dân tại Nhật Bản, được phát hành cho mọi người cư trú tại Nhật.

## Lợi ích của thẻ My Number

1. **Chứng minh nhân thân**: Có thể sử dụng thay cho giấy tờ tùy thân
2. **Thủ tục hành chính**: Làm thủ tục hành chính nhanh chóng hơn
3. **Nhận trợ cấp**: Cần thiết để nhận các khoản trợ cấp từ chính phủ
4. **Mở tài khoản ngân hàng**: Nhiều ngân hàng yêu cầu My Number

## Cách đăng ký

### Bước 1: Nhận giấy thông báo
Sau khi đăng ký địa chỉ cư trú, bạn sẽ nhận được giấy thông báo My Number qua đường bưu điện.

### Bước 2: Chụp ảnh
Chuẩn bị ảnh chân dung theo quy định:
- Kích thước: 4.5cm × 3.5cm
- Nền trắng
- Chụp trong vòng 6 tháng

### Bước 3: Nộp đơn
Có 3 cách nộp đơn:
1. **Online**: Qua website hoặc app
2. **Bưu điện**: Gửi đơn qua đường bưu điện
3. **Trực tiếp**: Đến ward office

### Bước 4: Nhận thẻ
Sau 1 tháng, bạn sẽ nhận được thông báo đến ward office để nhận thẻ.

## Lưu ý quan trọng

- Thẻ có hiệu lực 10 năm (5 năm cho người dưới 20 tuổi)
- Cần đặt mật khẩu khi nhận thẻ
- Không mất phí đăng ký
- Nếu mất thẻ, cần báo ngay cho ward office`,
      en: `# What is My Number Card?

My Number Card (マイナンバーカード) is the national ID card in Japan, issued to all residents.

## Benefits of My Number Card

1. **Identification**: Can be used as official ID
2. **Administrative procedures**: Faster government procedures
3. **Subsidies**: Required to receive government subsidies
4. **Bank account**: Required by many banks

## How to Register

### Step 1: Receive notification
After registering your address, you'll receive My Number notification by mail.

### Step 2: Prepare photo
Prepare a portrait photo meeting requirements:
- Size: 4.5cm × 3.5cm
- White background
- Taken within 6 months

### Step 3: Submit application
3 ways to apply:
1. **Online**: Via website or app
2. **Mail**: Send application by post
3. **In-person**: Visit ward office

### Step 4: Receive card
After 1 month, you'll receive notification to pick up at ward office.

## Important Notes

- Valid for 10 years (5 years for under 20)
- Need to set password when receiving
- No registration fee
- Report immediately if lost`,
      ja: `# マイナンバーカードとは？

マイナンバーカードは日本の国民IDカードで、すべての居住者に発行されます。

## マイナンバーカードのメリット

1. **本人確認**: 公的な身分証明書として使用可能
2. **行政手続き**: 行政手続きが迅速に
3. **給付金**: 政府からの給付金受取に必要
4. **銀行口座**: 多くの銀行で必要

## 申請方法

### ステップ1: 通知を受け取る
住所登録後、郵送でマイナンバー通知が届きます。

### ステップ2: 写真を準備
規定に沿った証明写真を用意：
- サイズ: 4.5cm × 3.5cm
- 白背景
- 6ヶ月以内に撮影

### ステップ3: 申請
3つの申請方法：
1. **オンライン**: ウェブサイトまたはアプリ
2. **郵送**: 申請書を郵送
3. **窓口**: 区役所で直接申請

### ステップ4: カード受取
1ヶ月後、区役所で受取の通知が届きます。

## 重要な注意点

- 有効期限10年（20歳未満は5年）
- 受取時にパスワード設定が必要
- 申請手数料無料
- 紛失時は即座に区役所へ報告`,
    },
    type: 'FREE',
    category: 'mynumber',
  },
  {
    id: 'guide-visa-renewal',
    title: {
      vi: 'Cách gia hạn Visa tại Nhật',
      en: 'How to Renew Your Visa in Japan',
      ja: '日本でのビザ更新方法',
    },
    description: {
      vi: 'Hướng dẫn thủ tục và giấy tờ cần thiết để gia hạn visa tại Nhật Bản',
      en: 'Guide on procedures and required documents for visa renewal in Japan',
      ja: '日本でのビザ更新に必要な手続きと書類のガイド',
    },
    imageUrl: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800&h=400&fit=crop',
    content: {
      vi: `# Gia hạn Visa tại Nhật Bản

## Thời điểm nộp đơn

Bạn có thể nộp đơn gia hạn visa từ **3 tháng trước** khi visa hết hạn.

## Giấy tờ cần thiết

### 1. Giấy tờ cơ bản
- Đơn xin gia hạn (Application for Extension)
- Ảnh 4x3cm (chụp trong 3 tháng)
- Passport và thẻ residence card
- Phí xử lý: ¥4,000

### 2. Giấy tờ tùy loại visa

#### Visa lao động
- Giấy xác nhận từ công ty
- Bảng lương 3 tháng gần nhất
- Giấy nộp thuế (納税証明書)

#### Visa du học
- Giấy xác nhận từ trường
- Bảng điểm và chứng nhận chuyên cần
- Bằng chứng tài chính

#### Visa gia đình/vợ chồng
- Giấy khai sinh/đăng ký kết hôn
- Bảng lương của người bảo lãnh
- Giấy tờ chứng minh quan hệ

## Quy trình gia hạn

### Bước 1: Chuẩn bị giấy tờ
Thu thập đầy đủ giấy tờ cần thiết theo loại visa.

### Bước 2: Nộp đơn
Đến Immigration Office và nộp đơn. Một số văn phòng cho phép đặt lịch trước.

### Bước 3: Chờ kết quả
Thời gian xử lý: 2 tuần - 1 tháng. Bạn sẽ nhận được postcard thông báo.

### Bước 4: Nhận kết quả
Mang postcard và passport đến Immigration để nhận kết quả.

## Lưu ý quan trọng

- **Không được** làm việc quá số giờ quy định
- Giữ gìn chuyên cần nếu là du học sinh
- Nộp thuế đầy đủ
- Có thể bị từ chối nếu vi phạm pháp luật

## Visa bị từ chối?

Nếu bị từ chối, bạn có thể:
1. Nộp đơn khiếu nại trong 7 ngày
2. Xin visa loại khác phù hợp hơn
3. Chuẩn bị rời Nhật trong thời gian được gia hạn`,
      en: `# Visa Renewal in Japan

## When to Apply

You can apply for visa renewal from **3 months before** expiration.

## Required Documents

### 1. Basic Documents
- Application for Extension form
- Photo 4x3cm (taken within 3 months)
- Passport and residence card
- Processing fee: ¥4,000

### 2. Visa-specific Documents

#### Work Visa
- Certificate from employer
- Salary slips for last 3 months
- Tax payment certificate (納税証明書)

#### Student Visa
- Certificate from school
- Transcript and attendance certificate
- Proof of financial support

#### Family/Spouse Visa
- Birth/marriage certificate
- Sponsor's salary slips
- Proof of relationship

## Renewal Process

### Step 1: Prepare Documents
Collect all required documents for your visa type.

### Step 2: Submit Application
Visit Immigration Office and submit. Some offices allow appointments.

### Step 3: Wait for Result
Processing time: 2 weeks - 1 month. You'll receive a postcard notification.

### Step 4: Receive Result
Bring postcard and passport to Immigration to get result.

## Important Notes

- **DO NOT** work over permitted hours
- Maintain attendance if student
- Pay all taxes
- May be rejected for law violations

## Visa Rejected?

If rejected, you can:
1. File objection within 7 days
2. Apply for different visa type
3. Prepare to leave during grace period`,
      ja: `# 日本でのビザ更新

## 申請時期

ビザ期限の**3ヶ月前から**更新申請が可能です。

## 必要書類

### 1. 基本書類
- 在留期間更新許可申請書
- 写真4x3cm（3ヶ月以内撮影）
- パスポートと在留カード
- 手数料：¥4,000

### 2. ビザ別書類

#### 就労ビザ
- 会社からの在職証明書
- 直近3ヶ月の給与明細
- 納税証明書

#### 留学ビザ
- 学校からの在学証明書
- 成績証明書と出席証明書
- 経費支弁書

#### 家族・配偶者ビザ
- 戸籍謄本/婚姻届受理証明書
- 扶養者の給与明細
- 関係証明書類

## 更新手続き

### ステップ1: 書類準備
ビザの種類に応じた必要書類を揃える。

### ステップ2: 申請
入国管理局へ行き申請。一部の管理局は予約可能。

### ステップ3: 結果待ち
処理期間：2週間〜1ヶ月。はがきで通知が届きます。

### ステップ4: 結果受取
はがきとパスポートを持参して結果を受け取る。

## 重要な注意点

- 許可時間を**超えて**働かない
- 留学生は出席率を維持
- 税金を完納
- 法律違反は不許可の原因に

## ビザが不許可の場合

不許可の場合：
1. 7日以内に異議申し立て
2. 別のビザへの変更申請
3. 猶予期間内に出国準備`,
    },
    type: 'FREE',
    category: 'visa',
  },

  // PREMIUM GUIDES
  {
    id: 'guide-shopping-tips',
    title: {
      vi: 'Mẹo mua thực phẩm ngon rẻ tại siêu thị Nhật',
      en: 'Tips for Buying Fresh Food Cheaply at Japanese Supermarkets',
      ja: '日本のスーパーで新鮮な食材を安く購入するコツ',
    },
    description: {
      vi: 'Bí quyết mua sắm thông minh để tiết kiệm chi phí sinh hoạt tại Nhật',
      en: 'Smart shopping secrets to save on living costs in Japan',
      ja: '日本での生活費を節約するスマートな買い物術',
    },
    imageUrl: 'https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=800&h=400&fit=crop',
    content: {
      vi: `# Mẹo mua thực phẩm ngon rẻ tại Nhật

## Thời điểm giảm giá vàng

### Buổi tối (19:00 - 21:00)
- Thực phẩm tươi sống được dán tem giảm giá 30-50%
- Đồ ăn chuẩn bị sẵn (bento, sushi) giảm mạnh
- **Mẹo**: Đến lúc 20:30 để có nhiều lựa chọn nhất

### Sáng sớm (8:00 - 10:00)
- Bánh mì nướng giảm giá 20-30%
- Rau củ mới về giá tốt

### Cuối tuần
- Chủ nhật tối: giảm giá nhiều nhất vì cửa hàng muốn thanh lý hàng
- Thứ 7 sáng: hàng mới về nhiều

## Siêu thị giá rẻ nên biết

### 1. Gyomu Super (業務スーパー)
- **Đặc điểm**: Giá rẻ nhất, hàng số lượng lớn
- **Nên mua**: Thực phẩm đông lạnh, gia vị, snack
- **Tránh**: Rau củ tươi (chất lượng không cao)

### 2. OK Store
- **Đặc điểm**: Luôn giảm giá 3-10%
- **Nên mua**: Tất cả các loại
- **Mẹo**: Mỗi ngày có sản phẩm đặc biệt giảm sâu

### 3. Don Quijote (ドン・キホーテ)
- **Đặc điểm**: Mở cửa 24/7, giá tốt về đêm
- **Nên mua**: Đồ ăn vặt, đồ uống
- **Thẻ**: Dùng thẻ Majica để được giảm thêm

### 4. Hanamasa (肉のハナマサ)
- **Đặc điểm**: Chuyên thịt, giá sỉ
- **Nên mua**: Thịt bò, thịt lợn, gà
- **Lưu ý**: Mua số lượng lớn, chia nhỏ đông lạnh

## Mẹo tiết kiệm cao cấp

### 1. Sử dụng App Point
- **Rakuten Point**: Tích điểm 1-3%
- **T-Point**: Dùng tại Family Mart, TSUTAYA
- **d Point**: Dùng tại Lawson

### 2. Mua hàng riêng (PB - Private Brand)
- **Topvalu** (AEON): Rẻ hơn 20-30%
- **Seven Premium** (7-Eleven)
- **みなさまのお墨付き** (Seiyu)

### 3. Theo dõi sản phẩm theo mùa
- **Mùa xuân**: Rau măng, cá ngừ
- **Mùa hè**: Cà chua, dưa hấu
- **Mùa thu**: Nấm, cá thu
- **Mùa đông**: Bắp cải hakusai, cá cơm

### 4. Mua buôn và đông lạnh
Các loại nên mua nhiều:
- Thịt (chia thành từng phần nhỏ)
- Nấm (có thể đông lạnh được)
- Bánh mì (giữ được 1 tháng)

## Tránh các bẫy giá

❌ **Tránh**:
- Mua ở combini ngoại trừ khẩn cấp (giá cao hơn 30-50%)
- Sản phẩm "セット売り" (bán theo set) - thường không lợi
- Sản phẩm ở tầng mắt (thường đắt hơn)

✅ **Nên**:
- So sánh giá theo 100g/100ml
- Mua hàng ở kệ trên cao hoặc dưới thấp
- Dùng túi mua sắm riêng (giảm 2-5 yên)

## Lịch giảm giá đặc biệt

- **Ngày 10, 20, 30 hàng tháng**: Nhiều siêu thị có khuyến mãi
- **Black Friday** (tháng 11): Giảm giá điện tử, quần áo
- **Năm mới**: Fukubukuro (福袋) - túi may mắn giá rẻ
- **Sau Tết Âm lịch**: Thực phẩm Trung Quốc giảm giá`,
      en: `# Tips for Buying Fresh Food Cheaply in Japan

## Golden Discount Times

### Evening (19:00 - 21:00)
- Fresh food gets 30-50% discount stickers
- Ready-made meals (bento, sushi) heavily discounted
- **Tip**: Visit at 20:30 for best selection

### Early Morning (8:00 - 10:00)
- Fresh bread 20-30% off
- New vegetables at good prices

### Weekends
- Sunday evening: Biggest discounts for clearance
- Saturday morning: Most new stock

## Budget Supermarkets to Know

### 1. Gyomu Super (業務スーパー)
- **Features**: Cheapest, bulk items
- **Buy**: Frozen foods, spices, snacks
- **Avoid**: Fresh vegetables (lower quality)

### 2. OK Store
- **Features**: Always 3-10% discount
- **Buy**: Everything
- **Tip**: Daily special deep discounts

### 3. Don Quijote (ドン・キホーテ)
- **Features**: 24/7, good night prices
- **Buy**: Snacks, beverages
- **Card**: Use Majica card for extra discount

### 4. Hanamasa (肉のハナマサ)
- **Features**: Meat specialist, wholesale prices
- **Buy**: Beef, pork, chicken
- **Note**: Buy bulk, divide and freeze

## Advanced Money-Saving Tips

### 1. Use Point Apps
- **Rakuten Point**: Earn 1-3%
- **T-Point**: Use at Family Mart, TSUTAYA
- **d Point**: Use at Lawson

### 2. Buy Private Brands (PB)
- **Topvalu** (AEON): 20-30% cheaper
- **Seven Premium** (7-Eleven)
- **みなさまのお墨付き** (Seiyu)

### 3. Follow Seasonal Products
- **Spring**: Bamboo shoots, tuna
- **Summer**: Tomatoes, watermelon
- **Autumn**: Mushrooms, mackerel
- **Winter**: Hakusai cabbage, sardines

### 4. Buy Bulk and Freeze
Good items to buy in bulk:
- Meat (divide into portions)
- Mushrooms (freezable)
- Bread (keeps 1 month frozen)

## Avoid Price Traps

❌ **Avoid**:
- Convenience stores except emergencies (30-50% markup)
- "Set sales" (セット売り) - usually not worth it
- Eye-level products (usually expensive)

✅ **Do**:
- Compare prices per 100g/100ml
- Buy from top or bottom shelves
- Bring reusable bags (save 2-5 yen)

## Special Discount Calendar

- **10th, 20th, 30th of month**: Many supermarket promotions
- **Black Friday** (November): Electronics, clothing discounts
- **New Year**: Fukubukuro (福袋) - lucky bags
- **After Lunar New Year**: Chinese food discounts`,
      ja: `# 日本のスーパーで新鮮な食材を安く購入するコツ

## ゴールデン値引きタイム

### 夜間（19:00 - 21:00）
- 生鮮食品に30-50%割引シール
- 総菜（弁当、寿司）大幅値引き
- **コツ**：20:30が最も品揃え豊富

### 早朝（8:00 - 10:00）
- 焼きたてパン20-30%オフ
- 新鮮野菜がお得

### 週末
- 日曜夜：最大の見切り品セール
- 土曜朝：新商品が最も多い

## 格安スーパーを知る

### 1. 業務スーパー
- **特徴**：最安、業務用サイズ
- **おすすめ**：冷凍食品、調味料、スナック
- **避ける**：生鮮野菜（品質やや低め）

### 2. OK Store
- **特徴**：常時3-10%割引
- **おすすめ**：全商品
- **コツ**：毎日の特売品は大幅割引

### 3. ドン・キホーテ
- **特徴**：24時間営業、夜がお得
- **おすすめ**：お菓子、飲料
- **カード**：Majicaカードで追加割引

### 4. 肉のハナマサ
- **特徴**：肉専門、業務用価格
- **おすすめ**：牛肉、豚肉、鶏肉
- **注意**：大量購入して小分け冷凍

## 上級節約テクニック

### 1. ポイントアプリ活用
- **楽天ポイント**：1-3%還元
- **Tポイント**：ファミマ、TSUTAYA
- **dポイント**：ローソン

### 2. プライベートブランド（PB）購入
- **トップバリュ**（イオン）：20-30%安い
- **セブンプレミアム**（セブン）
- **みなさまのお墨付き**（西友）

### 3. 旬の食材を追う
- **春**：たけのこ、マグロ
- **夏**：トマト、スイカ
- **秋**：きのこ、サバ
- **冬**：白菜、イワシ

### 4. まとめ買いと冷凍
まとめ買い推奨品：
- 肉類（小分けにして）
- きのこ（冷凍可能）
- パン（1ヶ月保存可）

## 価格の罠を避ける

❌ **避ける**：
- コンビニ（緊急時以外、30-50%高い）
- セット売り商品（お得でない場合多い）
- 目線の高さの商品（高価格が多い）

✅ **すべき**：
- 100g/100ml単価で比較
- 上段・下段の商品を狙う
- エコバッグ持参（2-5円引き）

## 特別セールカレンダー

- **毎月10日、20日、30日**：各スーパーのセール日
- **ブラックフライデー**（11月）：家電、衣類
- **正月**：福袋セール
- **旧正月後**：中華食材値引き`,
    },
    type: 'PREMIUM',
    category: 'shopping',
  },
  {
    id: 'guide-transport-savings',
    title: {
      vi: 'Mẹo sử dụng tàu điện tiết kiệm chi phí',
      en: 'Money-Saving Train Travel Tips',
      ja: '電車代を節約する裏技',
    },
    description: {
      vi: 'Các bí quyết giúp tiết kiệm chi phí đi lại bằng tàu điện tại Nhật',
      en: 'Secrets to save money on train travel in Japan',
      ja: '日本で電車代を節約する秘訣',
    },
    imageUrl: 'https://images.unsplash.com/photo-1464037866556-6812c9d1c72e?w=800&h=400&fit=crop',
    content: {
      vi: `# Mẹo tiết kiệm chi phí tàu điện

## Mua vé tháng thông minh

### Tuyến đường nào nên mua?
✅ **Nên mua** nếu:
- Đi lại 20 ngày/tháng trở lên
- Khoảng cách > 5km
- Giá vé 1 chiều > ¥200

❌ **Không nên** nếu:
- Làm remote nhiều
- Khoảng cách ngắn
- Công ty hoàn vé

### Mẹo tối ưu vé tháng

**1. Chọn tuyến có lợi nhất**
- Không nhất thiết phải đúng tuyến thường đi
- Có thể mua tuyến dài hơn nếu bao gồm nhiều ga hơn
- Ví dụ: Shibuya-Shinjuku thay vì chỉ đến Harajuku

**2. Kết hợp nhiều tuyến**
- Mua 2 vé tháng cho 2 tuyến khác nhau có thể rẻ hơn mua 1 vé tháng dài

## Vé giảm giá đặc biệt

### 1. Seishun 18 Kippu (青春18きっぷ)
- **Giá**: ¥12,050 cho 5 ngày
- **Thời gian**: Mùa xuân, hè, đông
- **Phù hợp**: Du lịch xa, đi chậm không vấn đề
- **Lưu ý**: Chỉ dùng được tàu thường (không Shinkansen)

### 2. Tokyo Metro 24h Pass
- **Giá**: ¥600 (nước ngoài), ¥800 (người Nhật)
- **Phù hợp**: Đi nhiều nơi trong ngày ở Tokyo

### 3. JR Kanto Area Pass
- **Giá**: ¥10,180 (3 ngày)
- **Vùng**: Toàn vùng Kanto
- **Lưu ý**: Chỉ dành cho người nước ngoài

## Mẹo đi tàu tiết kiệm

### 1. Tránh giờ cao điểm
- Một số tuyến giá khác nhau theo giờ
- Đi sau 10h sáng được giảm giá tại một số tuyến

### 2. Đi bộ 1 ga
- Tiết kiệm ¥150-200 mỗi chuyến
- Tốt cho sức khỏe
- Ví dụ: Shibuya → Harajuku (15 phút đi bộ)

### 3. Sử dụng App định tuyến
- **Yahoo!乗換案内**: Tìm tuyến rẻ nhất
- **Google Maps**: So sánh giá
- Chọn "最安" (rẻ nhất) thay vì "最速" (nhanh nhất)

### 4. Nạp Suica/Pasmo thông minh
- Nạp qua JRE Point: Nhận 0.5-1% hoàn trả
- Nạp qua View Card: Nhận 1.5% point

## Vé xe buýt giá rẻ

### Toei Bus One Day Pass
- **Giá**: ¥500
- **Dùng cho**: 23 quận Tokyo
- **Mẹo**: Kết hợp với Metro pass

## Vé máy bay nội địa rẻ

Nếu đi xa (>300km), máy bay có thể rẻ hơn tàu:

### 1. Peach, Jetstar
- **Tuyến phổ biến**: Tokyo-Osaka từ ¥4,000
- **Mẹo**: Đặt sớm 2-3 tháng

### 2. So sánh với Shinkansen
- Shinkansen Tokyo-Osaka: ¥13,320
- Máy bay: ¥4,000-8,000
- **Lưu ý**: Tính thêm thời gian và tiền đến sân bay

## Thẻ tín dụng hữu ích

### 1. View Card (JR東日本)
- Nạp Suica nhận 1.5%
- Mua vé tháng nhận 3%

### 2. To Me Card
- Dùng Tokyo Metro nhận point
- 1 point = 1 yen

### 3. Tokyu Card
- Dùng Tokyu Line nhận 0.5-1%

## Lịch giảm giá đặc biệt

- **Tháng 3, 9**: Vé Seishun 18
- **Tháng 7-8**: Sale vé máy bay mùa hè
- **Tháng 12-1**: Sale năm mới`,
      en: `# Money-Saving Train Travel Tips

## Smart Monthly Pass Buying

### Which route to buy?
✅ **Buy if**:
- Travel 20+ days/month
- Distance > 5km
- Single fare > ¥200

❌ **Don't buy if**:
- Work remote often
- Short distance
- Company reimburses

### Monthly Pass Optimization

**1. Choose most beneficial route**
- Doesn't have to match exact route
- Can buy longer route covering more stations
- Example: Shibuya-Shinjuku instead of just to Harajuku

**2. Combine multiple routes**
- Two passes for different routes may be cheaper than one long pass

## Special Discount Tickets

### 1. Seishun 18 Kippu (青春18きっぷ)
- **Price**: ¥12,050 for 5 days
- **Seasons**: Spring, summer, winter
- **Good for**: Long trips, slow travel OK
- **Note**: Local trains only (no Shinkansen)

### 2. Tokyo Metro 24h Pass
- **Price**: ¥600 (foreigners), ¥800 (residents)
- **Good for**: Multiple destinations in Tokyo

### 3. JR Kanto Area Pass
- **Price**: ¥10,180 (3 days)
- **Area**: All Kanto region
- **Note**: Foreigners only

## Travel Saving Tips

### 1. Avoid Peak Hours
- Some routes have time-based pricing
- Travel after 10am for discounts

### 2. Walk One Station
- Save ¥150-200 per trip
- Good for health
- Example: Shibuya → Harajuku (15 min walk)

### 3. Use Route Apps
- **Yahoo!乗換案内**: Find cheapest route
- **Google Maps**: Compare prices
- Choose "最安" (cheapest) not "最速" (fastest)

### 4. Smart Suica/Pasmo Charging
- Charge via JRE Point: 0.5-1% cashback
- Charge via View Card: 1.5% points

## Cheap Bus Tickets

### Toei Bus One Day Pass
- **Price**: ¥500
- **Coverage**: 23 Tokyo wards
- **Tip**: Combine with Metro pass

## Domestic Flight Deals

For long distances (>300km), flights can be cheaper:

### 1. Peach, Jetstar
- **Popular**: Tokyo-Osaka from ¥4,000
- **Tip**: Book 2-3 months ahead

### 2. Compare with Shinkansen
- Shinkansen Tokyo-Osaka: ¥13,320
- Flight: ¥4,000-8,000
- **Note**: Factor in airport time and cost

## Useful Credit Cards

### 1. View Card (JR東日本)
- 1.5% on Suica charge
- 3% on monthly passes

### 2. To Me Card
- Earn points on Tokyo Metro
- 1 point = 1 yen

### 3. Tokyu Card
- 0.5-1% on Tokyu Line

## Special Sale Calendar

- **March, September**: Seishun 18 tickets
- **July-August**: Summer flight sales
- **December-January**: New Year sales`,
      ja: `# 電車代を節約する裏技

## 賢い定期券の買い方

### どの路線を買うべき？
✅ **買うべき**：
- 月20日以上利用
- 距離 > 5km
- 片道運賃 > ¥200

❌ **不要**：
- リモート勤務が多い
- 短距離
- 会社が実費精算

### 定期券最適化のコツ

**1. 最もお得な経路を選ぶ**
- 実際の通勤ルートと一致させる必要なし
- より多くの駅をカバーする長い区間の方がお得な場合も
- 例：原宿までより渋谷-新宿

**2. 複数の定期を組み合わせ**
- 2つの定期を別々に買う方が1つの長い定期より安い場合も

## 特別割引切符

### 1. 青春18きっぷ
- **価格**：¥12,050（5日分）
- **期間**：春・夏・冬
- **向いている**：遠距離旅行、時間に余裕
- **注意**：普通列車のみ（新幹線不可）

### 2. 東京メトロ24時間券
- **価格**：¥600（外国人）、¥800（一般）
- **向いている**：都内複数箇所移動

### 3. JR関東エリアパス
- **価格**：¥10,180（3日間）
- **エリア**：関東全域
- **注意**：外国人のみ

## 節約テクニック

### 1. 時間帯をずらす
- 一部路線は時間帯別運賃
- 10時以降の利用で割引

### 2. 1駅歩く
- 1回¥150-200節約
- 健康にも良い
- 例：渋谷→原宿（徒歩15分）

### 3. 経路検索アプリ活用
- **Yahoo!乗換案内**：最安経路検索
- **Google Maps**：料金比較
- 「最速」より「最安」を選択

### 4. Suica/Pasmoの賢いチャージ
- JRE Point経由：0.5-1%還元
- View Card経由：1.5%ポイント

## 格安バス券

### 都営バス一日乗車券
- **価格**：¥500
- **範囲**：都内23区
- **コツ**：メトロパスと併用

## 国内線格安航空券

遠距離（>300km）は飛行機が安い場合も：

### 1. Peach、Jetstar
- **人気路線**：東京-大阪 ¥4,000〜
- **コツ**：2-3ヶ月前予約

### 2. 新幹線と比較
- 新幹線東京-大阪：¥13,320
- 飛行機：¥4,000-8,000
- **注意**：空港への時間・費用も計算

## お得なクレジットカード

### 1. ビューカード（JR東日本）
- Suicaチャージで1.5%
- 定期券購入で3%

### 2. To Me Card
- 東京メトロでポイント
- 1ポイント = 1円

### 3. 東急カード
- 東急線で0.5-1%

## セールカレンダー

- **3月、9月**：青春18きっぷ
- **7-8月**：夏の航空券セール
- **12-1月**：正月セール`,
    },
    type: 'PREMIUM',
    category: 'tips',
  },
];

export const seedGuides = async () => {
  try {
    console.log('Starting to seed guides...');

    let addedCount = 0;
    let updatedCount = 0;

    for (const guide of SAMPLE_GUIDES) {
      const { id, ...guideData } = guide;
      const guideRef = doc(db, 'guides', id);

      // Check if guide already exists
      const existingGuide = await getDoc(guideRef);

      if (existingGuide.exists()) {
        // Update existing guide
        await setDoc(
          guideRef,
          {
            ...guideData,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        console.log(`🔄 Updated guide: ${guide.title.en} (ID: ${id})`);
        updatedCount++;
      } else {
        // Create new guide
        await setDoc(guideRef, {
          ...guideData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        console.log(`✅ Added guide: ${guide.title.en} (ID: ${id})`);
        addedCount++;
      }
    }

    console.log(`\n✨ Seed complete! Added: ${addedCount}, Updated: ${updatedCount}`);
    return true;
  } catch (error) {
    console.error('❌ Error seeding guides:', error);
    return false;
  }
};

// Uncomment to run this script directly
// seedGuides();
