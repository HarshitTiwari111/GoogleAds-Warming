class APIFeatures {
  constructor(query, queryStr) {
    this.query = query;
    this.queryStr = queryStr;
  }

  search(fields = []) {
    if (this.queryStr.search) {
      const escaped = this.queryStr.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escaped, 'i');
      const searchConditions = fields.map(field => ({ [field]: searchRegex }));
      this.query = this.query.find({ $or: searchConditions });
      this.searchFilter = { $or: searchConditions };
      // Controllers merge filterObj into countDocuments so pagination totals
      // reflect the same conditions as the data query.
      this.filterObj = { ...(this.filterObj || {}), $or: searchConditions };
    }
    return this;
  }

  filter() {
    const queryObj = { ...this.queryStr };
    const excludedFields = ['page', 'sort', 'limit', 'search', 'fields'];
    excludedFields.forEach(el => delete queryObj[el]);

    const sanitized = {};
    for (const [key, value] of Object.entries(queryObj)) {
      if (typeof key === 'string' && !key.startsWith('$')) {
        sanitized[key] = value;
      }
    }

    let queryString = JSON.stringify(sanitized);
    queryString = queryString.replace(/\b(gte|gt|lte|lt)\b/g, match => `$${match}`);
    const parsed = JSON.parse(queryString);
    this.query = this.query.find(parsed);
    this.filterObj = { ...(this.filterObj || {}), ...parsed };
    return this;
  }

  sort() {
    if (this.queryStr.sort) {
      const sortBy = this.queryStr.sort.split(',').join(' ');
      this.query = this.query.sort(sortBy);
    } else {
      this.query = this.query.sort('-createdAt');
    }
    return this;
  }

  paginate() {
    const page = parseInt(this.queryStr.page, 10) || 1;
    const limit = parseInt(this.queryStr.limit, 10) || 10;
    const skip = (page - 1) * limit;
    this.query = this.query.skip(skip).limit(limit);
    this.pagination = { page, limit };
    return this;
  }
}

module.exports = APIFeatures;
