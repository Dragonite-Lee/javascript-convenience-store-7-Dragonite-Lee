import { Console, DateTimes } from '@woowacourse/mission-utils';
import fs from 'fs';

class InputView {
  static async readPurchaseItems() {
    const input = await Console.readLineAsync(
      '구매하실 상품명과 수량을 입력해 주세요. (예: [사이다-2],[감자칩-1])'
    );

    return input.split('],[').map((item) => {
      const cleanItem = item.replace(/[\[\]]/g, '');
      const [name, quantity] = cleanItem.split('-');
      return {
        name,
        quantity: parseInt(quantity),
      };
    });
  }

  static async readMembershipChoice() {
    return await Console.readLineAsync('멤버십 할인을 받으시겠습니까? (Y/N)');
  }

  static async readAdditionalPurchase() {
    return await Console.readLineAsync(
      '감사합니다. 구매하고 싶은 다른 상품이 있나요? (Y/N)'
    );
  }

  static async readPromotionChoice(productName, quantity) {
    return await Console.readLineAsync(
      `${productName} ${quantity}개를 무료로 더 받으실 수 있습니다. 추가하시겠습니까? (Y/N)`
    );
  }

  static async readPromotionShortageChoice(productName, quantity) {
    return await Console.readLineAsync(
      `${quantity}개 더 구매하시면 프로모션이 적용됩니다. 추가 구매하시겠습니까? (Y/N)`
    );
  }
}

class OutputView {
  static printWelcome() {
    Console.print('안녕하세요. W편의점입니다.');
    Console.print('현재 보유하고 있는 상품입니다.\n');
  }

  static printProducts(products) {
    products.forEach((product) => {
      const quantityText =
        product.quantity > 0 ? `${product.quantity}개` : '재고 없음';
      const promotionText = product.promotionType
        ? ` ${product.promotionType}`
        : '';

      if (!product.promotionType && product.quantity === 0) {
        Console.print(
          `- ${product.name} ${product.price.toLocaleString()}원 재고 없음`
        );
      } else {
        Console.print(
          `- ${
            product.name
          } ${product.price.toLocaleString()}원 ${quantityText}${promotionText}`
        );
      }
    });
  }

  static printReceipt(receipt) {
    Console.print('==============W 편의점================');
    Console.print('상품명\t\t수량\t금액');

    const mergedItems = receipt.items.map((item) => {
      const freeItem = receipt.freeItems.find(
        (free) => free.name === item.name
      );

      const totalQuantity = freeItem
        ? item.quantity + freeItem.quantity
        : item.quantity;

      const unitPrice = item.price / item.quantity;

      return {
        name: item.name,
        quantity: totalQuantity,

        price: unitPrice * totalQuantity,
      };
    });

    mergedItems.forEach((item) => {
      Console.print(
        `${item.name}\t${item.quantity}\t${item.price.toLocaleString()}`
      );
    });

    if (receipt.freeItems.length > 0) {
      Console.print('=============증\t정===============');
      receipt.freeItems.forEach((item) => {
        Console.print(`${item.name}\t${item.quantity}`);
      });
    }

    Console.print('====================================');

    const totalQuantity = receipt.totalQuantity;

    const totalAmount =
      receipt.totalAmount +
      receipt.freeItems.reduce((acc, item) => {
        const originalItem = receipt.items.find((i) => i.name === item.name);
        return (
          acc + (originalItem.price / originalItem.quantity) * item.quantity
        );
      }, 0);

    const finalAmountWithDiscounts =
      totalAmount - receipt.promotionDiscount - receipt.membershipDiscount;

    Console.print(
      `총구매액\t${totalQuantity}\t${totalAmount.toLocaleString()}`
    );
    Console.print(`행사할인\t\t-${receipt.promotionDiscount.toLocaleString()}`);
    Console.print(
      `멤버십할인\t\t-${receipt.membershipDiscount.toLocaleString()}`
    );
    Console.print(`내실돈\t\t\t${finalAmountWithDiscounts.toLocaleString()}`);
  }
}

class Store {
  constructor() {
    this.promotions = this.loadPromotions();
    this.products = this.loadProducts();
  }
  findProduct(name) {
    const product = this.products.find((p) => p.name === name);
    if (!product) {
      throw new Error(`상품 '${name}'을(를) 찾을 수 없습니다.`);
    }
    return product;
  }

  loadProducts() {
    const content = fs.readFileSync('./public/products.md', 'utf8');
    const products = content
      .split('\n')
      .slice(1)
      .filter((line) => line.trim() !== '')
      .map((line) => {
        const [name, price, quantity, promotionType] = line.split(',');
        return {
          name,
          price: parseInt(price),
          quantity: parseInt(quantity),
          promotionType: promotionType?.trim() || '',
        };
      });

    const productGroups = products.reduce((groups, product) => {
      if (!groups[product.name]) {
        groups[product.name] = {
          withPromotion: null,
          withoutPromotion: null,
        };
      }

      if (product.promotionType && this.findApplicablePromotion(product)) {
        groups[product.name].withPromotion = product;
      } else {
        groups[product.name].withoutPromotion = product;
      }

      return groups;
    }, {});

    const balancedProducts = [];
    Object.entries(productGroups).forEach(([name, versions]) => {
      if (versions.withPromotion) {
        balancedProducts.push(versions.withPromotion);
        if (!versions.withoutPromotion) {
          balancedProducts.push({
            name,
            price: versions.withPromotion.price,
            quantity: 0,
            promotionType: '',
          });
        } else {
          balancedProducts.push(versions.withoutPromotion);
        }
      } else if (versions.withoutPromotion) {
        balancedProducts.push(versions.withoutPromotion);
      }
    });

    return balancedProducts;
  }

  loadPromotions() {
    const content = fs.readFileSync('./public/promotions.md', 'utf8');
    return content
      .split('\n')
      .slice(1)
      .filter((line) => line.trim() !== '')
      .map((line) => {
        const [name, buy, get, startDate, endDate] = line.split(',');
        return {
          name: name.trim(),
          buy: parseInt(buy),
          get: parseInt(get),
          startDate: new Date(startDate),
          endDate: new Date(endDate),
        };
      });
  }

  isPromotionValid(promotion) {
    const now = DateTimes.now();
    return now >= promotion.startDate && now <= promotion.endDate;
  }

  findApplicablePromotion(product) {
    if (!product.promotionType) return null;

    const promotion = this.promotions.find(
      (p) => p.name === product.promotionType
    );
    if (!promotion || !this.isPromotionValid(promotion)) return null;

    return promotion;
  }

  async handlePromotion(product, orderQuantity, promotion, freeItems) {
    let adjustedQuantity = orderQuantity;
    if (product.quantity < orderQuantity) {
      throw new Error(
        `[ERROR] 재고 수량을 초과하여 구매할 수 없습니다. 다시 입력해 주세요.`
      );
    }

    if (promotion.buy === 2 && (orderQuantity - 2) % 3 === 0) {
      const addPromotion = await InputView.readPromotionChoice(
        product.name,
        promotion.get
      );
      if (addPromotion.toUpperCase() === 'Y') {
        const promotionSets = Math.floor(orderQuantity / promotion.buy);
        const freeQuantity = promotionSets * promotion.get;

        const isStockSufficient =
          product.quantity >= orderQuantity + freeQuantity;
        if (isStockSufficient) {
          freeItems.push({ name: product.name, quantity: freeQuantity });
        } else {
          const shortageQuantity =
            orderQuantity + freeQuantity - product.quantity;
          const purchaseShortage = await InputView.readPromotionShortageChoice(
            product.name,
            shortageQuantity
          );
          if (purchaseShortage.toUpperCase() === 'N') {
            return adjustedQuantity;
          }
          const availableFreeQuantity = Math.max(
            0,
            product.quantity - orderQuantity
          );
          if (availableFreeQuantity > 0) {
            freeItems.push({
              name: product.name,
              quantity: availableFreeQuantity,
            });
          }
        }
      }
    } else if (promotion.buy === 1 && orderQuantity % 2 === 1) {
      const addPromotion = await InputView.readPromotionChoice(product.name, 1);
      if (addPromotion.toUpperCase() === 'Y') {
        adjustedQuantity += 1;
        const promotionSets = Math.floor(adjustedQuantity / promotion.buy);
        const freeQuantity = promotionSets * promotion.get;

        const isStockSufficient =
          product.quantity >= adjustedQuantity + freeQuantity;
        if (isStockSufficient) {
          freeItems.push({ name: product.name, quantity: freeQuantity });
        } else {
          const shortageQuantity =
            adjustedQuantity + freeQuantity - product.quantity;
          const purchaseShortage = await InputView.readPromotionShortageChoice(
            product.name,
            shortageQuantity
          );
          if (purchaseShortage.toUpperCase() === 'N') {
            return adjustedQuantity;
          }
          const availableFreeQuantity = Math.max(
            0,
            product.quantity - adjustedQuantity
          );
          if (availableFreeQuantity > 0) {
            freeItems.push({
              name: product.name,
              quantity: availableFreeQuantity,
            });
          }
        }
      }
    }

    return adjustedQuantity;
  }

  async calculateOrderDetails(orders) {
    let totalAmount = 0;
    let totalQuantity = 0;
    const items = [];
    const freeItems = [];

    for (const order of orders) {
      const product = this.findProduct(order.name);
      const promotion = this.findApplicablePromotion(product);

      let orderQuantity = order.quantity;

      if (promotion) {
        orderQuantity = await this.handlePromotion(
          product,
          orderQuantity,
          promotion,
          freeItems
        );
      }

      const price = product.price * orderQuantity;
      totalAmount += price;

      items.push({ name: product.name, quantity: orderQuantity, price });

      const currentFreeItem = freeItems.find(
        (item) => item.name === product.name
      );
      const freeQuantity = currentFreeItem ? currentFreeItem.quantity : 0;
      totalQuantity += orderQuantity + freeQuantity;

      product.quantity -= orderQuantity + freeQuantity;
    }

    const promotionDiscount = this.calculatePromotionDiscount(items, freeItems);

    return {
      items,
      freeItems,
      totalAmount,
      totalQuantity,
      promotionDiscount,
      membershipDiscount: 0,
      finalAmount: totalAmount - promotionDiscount,
    };
  }
  calculatePromotionDiscount(items, freeItems) {
    let discount = 0;
    freeItems.forEach((freeItem) => {
      const originalItem = items.find((item) => item.name === freeItem.name);
      if (originalItem) {
        const unitPrice = originalItem.price / originalItem.quantity;
        discount += unitPrice * freeItem.quantity;
      }
    });
    return discount;
  }

  applyMembershipDiscount(receipt) {
    const discountableAmount = receipt.totalAmount - receipt.promotionDiscount;
    const discount = Math.min(Math.floor(discountableAmount * 0.3), 8000);
    receipt.membershipDiscount = discount;
    receipt.finalAmount =
      receipt.totalAmount -
      receipt.promotionDiscount -
      receipt.membershipDiscount;
    return receipt;
  }
}
class App {
  constructor() {
    this.store = new Store();
  }

  async run() {
    OutputView.printWelcome();

    let continueShopping = true;
    while (continueShopping) {
      try {
        OutputView.printProducts(this.store.products);

        const orderInput = await InputView.readPurchaseItems();
        if (!Array.isArray(orderInput) || orderInput.length === 0) {
          throw new Error('[ERROR] 올바른 주문 형식이 아닙니다.');
        }
        const receipt = await this.store.calculateOrderDetails(orderInput);
        console.log('receipt: ', receipt);

        const membershipChoice = await InputView.readMembershipChoice();
        if (membershipChoice.toUpperCase() === 'Y') {
          this.store.applyMembershipDiscount(receipt);
        }

        OutputView.printReceipt(receipt);
        const additionalPurchase = await InputView.readAdditionalPurchase();
        continueShopping = additionalPurchase.toUpperCase() === 'Y';
      } catch (error) {
        Console.print(error.message);
        continueShopping = false;
      }
    }
  }
}

export default App;
