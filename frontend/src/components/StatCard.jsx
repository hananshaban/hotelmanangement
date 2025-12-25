const StatCard = ({ title, value, icon, trend, trendValue, className = '' }) => {
  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className={`text-2xl font-bold mt-2 ${className || 'text-gray-900'}`}>{value}</p>
          {trend && trendValue && (
            <p className={`text-xs mt-1 ${trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
              {trend === 'up' ? '↑' : '↓'} {trendValue}
            </p>
          )}
        </div>
        {icon && (
          <div className="p-3 bg-primary-100 rounded-lg">
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}

export default StatCard

