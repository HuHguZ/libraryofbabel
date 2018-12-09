let sha512 = require(`js-sha512`);

module.exports = ({
	lengthOfPage = 4813, 
	lengthOfTitle = 31, 
	digs = '0123456789abcdefghijklmnopqrstuvwxyz', 
	alphabet = 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя, .',
	wall = 5,
	shelf = 7,
	volume = 31,
	page = 421,
} = {}) => {

	let seed = 13;

	const rnd = (min = 1, max = 0) => {
		seed = (seed * 22695477 + 1) % 4294967296;
		return min + seed / 4294967296 * (max - min);
	};

	const pad = function(s, size) {
	    let l = size - s.length;
	    return `${l ? `0`.repeat(l) : ``}${s}`;
	}

	let getHash = str => parseInt(sha512(str).slice(0, 7), 16);

	const mod = (a, b) => ((a % b) + b) % b;

	const digsIndexes = {};
	const alphabetIndexes = {};

	Array.from(digs).forEach((char, position) => {
		digsIndexes[char] = position;
	});

	Array.from(alphabet).forEach((char, position) => {
		alphabetIndexes[char] = position;
	});

	return {
		wall,
		shelf,
		volume,
		page,
		lengthOfPage,
		lengthOfTitle,
		search(searchStr) {
			let wall = `${(Math.random() * this.wall + 1 ^ 0)}`,
				shelf = `${(Math.random() * this.shelf + 1 ^ 0)}`,
				volume = pad(`${(Math.random()* this.volume + 1 ^ 0)}`, 2),
				page = pad(`${(Math.random()* this.page + 1 ^ 0)}`, 3),
				locHash = getHash(`${wall}${shelf}${volume}${page}`), 
				hex = ``,
				depth = Math.random() * (this.lengthOfPage - searchStr.length) ^ 0;
			for (let i = 0; i < depth; i++){
				searchStr = alphabet[Math.random() * alphabet.length ^ 0] + searchStr;
			}
			seed = locHash;
			for (let i = 0; i < searchStr.length; i++){
				let index = alphabetIndexes[searchStr[i]] || -1,
					rand = rnd(0, alphabet.length),
					newIndex = mod(index + parseInt(rand), digs.length), 
					newChar = digs[newIndex];
				hex += newChar;
			}
			return `${hex}-${wall}-${shelf}-${+volume}-${+page}`; 
		},

		searchExactly(text) {
			const pos = Math.random() * (this.lengthOfPage - text.length) ^ 0;
			return this.search(`${` `.repeat(pos)}${text}${` `.repeat(this.lengthOfPage - (pos + text.length))}`);
		},

		searchTitle(searchStr) {
			let wall = `${(Math.random() * this.wall + 1 ^ 0)}`,
				shelf = `${(Math.random() * this.shelf + 1 ^ 0)}`,
				volume = pad(`${(Math.random()* this.volume + 1 ^ 0)}`, 2),
				locHash = getHash(`${wall}${shelf}${volume}`), 
				hex = ``;
			searchStr = searchStr.substr(0, this.lengthOfTitle);
			searchStr = searchStr.length == this.lengthOfTitle ? searchStr : `${searchStr}${` `.repeat(this.lengthOfTitle - searchStr.length)}`;
			seed = locHash;
			for (let i = 0; i < searchStr.length; i++){
				let index = alphabetIndexes[searchStr[i]],
					rand = rnd(0, alphabet.length),
					newIndex = mod(index + parseInt(rand), digs.length),
					newChar = digs[newIndex];
				hex += newChar;
			}
			return `${hex}-${wall}-${shelf}-${+volume}`; 
		},

		getPage(address) {
			let addressArray = address.split(`-`),
				hex = addressArray[0], 
				locHash = getHash(`${addressArray[1]}${addressArray[2]}${pad(addressArray[3], 2)}${pad(addressArray[4], 3)}`),
				result = ``;
			seed = locHash;
			for (let i = 0; i < hex.length; i++) {
				let index = digsIndexes[hex[i]],
					rand = rnd(0, digs.length),
					newIndex = mod(index - parseInt(rand), alphabet.length), 
					newChar = alphabet[newIndex];
				result += newChar;
			}
			seed = getHash(result);
			while (result.length < this.lengthOfPage) {
				result += alphabet[parseInt(rnd(0, alphabet.length))];
			}
			return result.substr(result.length - this.lengthOfPage);
		},

		getTitle(address) {
			let addressArray = address.split(`-`),
				hex = addressArray[0], 
				locHash = getHash(`${addressArray[1]}${addressArray[2]}${pad(addressArray[3], 2)}`),
				result = ``;
			seed = locHash;
			for (let i = 0; i < hex.length; i++) {
				let index = digsIndexes[hex[i]],
					rand = rnd(0, digs.length),
					newIndex = mod(index - parseInt(rand), alphabet.length),
					newChar = alphabet[newIndex];
				result += newChar;
			}
			seed = getHash(result);
			while (result.length < this.lengthOfTitle) {
				result += alphabet[parseInt(rnd(0, alphabet.length))];
			}
			return result.substr(result.length - this.lengthOfTitle);
		}

	};
}