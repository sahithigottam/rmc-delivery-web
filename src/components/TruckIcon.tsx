export const TRUCK_ICON_URL = "https://img.freepik.com/free-vector/truck-cement-mixer-cartoon-vector-icon-illustration-transportation-vehicle-icon-isolated-flat_138676-13348.jpg";

interface TruckIconProps {
  size?: number;
  className?: string;
}

export default function TruckIcon({ size = 20, className = "" }: TruckIconProps) {
  return (
    <img
      src={TRUCK_ICON_URL}
      alt="RMC Truck"
      width={size}
      height={size}
      className={`inline-block ${className}`}
      style={{ 
        borderRadius: '50%',
        background: 'white',
        padding: '2px',
      }}
    />
  );
}
